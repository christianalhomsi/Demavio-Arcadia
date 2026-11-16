-- Remaining fixes from the QA pass of 2026-11-16.
--
-- 1. A fixed session that ran past its booked end and was not ended yet still occupies the device: it now
--    blocks check-ins / walk-ins with a clear "device in use" (instead of a raw unique-index error) and shows
--    as busy until now on the public booking page. Billing is unchanged: time played past the booked end is
--    charged, as for package overtime; the owner can still round it down or set a custom price on the invoice.
-- 2. A cash refund cannot take more cash than the open shift's drawer holds (same rule as wallet withdrawals).


-- 1.

create or replace function public.device_blocking_reason(
  p_device uuid, p_from timestamptz, p_to timestamptz,
  p_ignore_reservation uuid default null, p_ignore_session uuid default null
) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_to timestamptz := coalesce(p_to, 'infinity');
begin
  if exists (select 1 from public.devices where id = p_device and status <> 'active') then
    return 'device_disabled';
  end if;
  if exists (select 1 from public.device_maintenance
              where device_id = p_device and ended_at is null
                and (expected_end is null or expected_end > p_from)) then
    return 'maintenance';
  end if;
  if exists (select 1 from public.sessions s
              where s.device_id = p_device and s.status in ('starting', 'in_progress', 'ending')
                and (p_ignore_session is null or s.id <> p_ignore_session)
                -- An overdue session (past its booked end, not ended yet) still holds the device right now.
                and (s.scheduled_end_at is null or s.scheduled_end_at > p_from
                     or (s.scheduled_end_at <= now() and p_from <= now()))
                and s.started_at < v_to) then
    return 'device_in_use';
  end if;
  if exists (select 1 from public.reservations r
              where r.device_id = p_device and r.status in ('pending', 'confirmed')
                and (p_ignore_reservation is null or r.id <> p_ignore_reservation)
                and r.start_at < v_to and r.end_at > p_from) then
    return 'reservation_conflict';
  end if;
  return null;
end $$;

create or replace function public.list_public_device_busy(p_device_id uuid, p_from timestamptz, p_to timestamptz)
returns table (start_at timestamptz, end_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '8 days' then
    perform public.raise_contract_error('VALIDATION', 'period');
  end if;
  if not exists (
    select 1 from public.devices d
      join public.halls h on h.id = d.hall_id
     where d.id = p_device_id and d.status = 'active' and h.status = 'active'
  ) then
    perform public.raise_contract_error('NOT_FOUND');
  end if;

  return query
    select r.start_at, r.end_at
      from public.reservations r
     where r.device_id = p_device_id and r.status in ('pending', 'confirmed', 'checked_in')
       and r.start_at < p_to and r.end_at > p_from
    union all
    select s.started_at, coalesce(greatest(s.scheduled_end_at, now()), p_to)
      from public.sessions s
     where s.device_id = p_device_id and s.status in ('starting', 'in_progress', 'ending')
       and s.started_at < p_to and coalesce(greatest(s.scheduled_end_at, now()), p_to) > p_from
    union all
    select m.started_at, coalesce(m.expected_end, p_to)
      from public.device_maintenance m
     where m.device_id = p_device_id and m.ended_at is null
       and m.started_at < p_to and coalesce(m.expected_end, p_to) > p_from
    order by 1;
end $$;

-- 2.

create or replace function public.decide_refund(p_refund_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.refunds; v_p public.payments; v_w public.wallets; v_wt public.wallet_transactions; v_new bigint;
        v_refundable bigint; v_sh public.shifts; v_cur char(3);
begin
  select * into v_r from public.refunds where id = p_refund_id for update;
  if not found or not public.has_hall_permission(v_r.hall_id, 'refund.approve') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_r.status <> 'pending' then
    -- Retry-safe: repeating the same decision is a no-op; the opposite decision is refused.
    if (v_r.status = 'approved') = p_approve then return; end if;
    perform public.raise_contract_error('PRECONDITION_FAILED', 'already_decided');
  end if;
  if p_approve is null then perform public.raise_contract_error('VALIDATION', 'decision'); end if;
  -- Approving your own request needs a second person, when the hall has one. Rejecting (withdrawing) it is
  -- always allowed.
  if p_approve and v_r.requested_by = auth.uid() and exists (
       select 1 from public.hall_memberships m
        where m.hall_id = v_r.hall_id and m.status = 'active' and m.user_id <> auth.uid()
          and 'refund.approve' = any (public.membership_permissions(m.id))) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'self_approval');
  end if;
  if p_note is not null and length(p_note) > 300 then perform public.raise_contract_error('VALIDATION', 'note'); end if;

  if not p_approve then
    update public.refunds set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), '')
     where id = p_refund_id;
    perform public.write_audit(v_r.hall_id, 'refund.reject', 'refund', p_refund_id::text, nullif(btrim(p_note), ''), null,
      jsonb_build_object('withdrawn_by_requester', v_r.requested_by = auth.uid()));
    return;
  end if;

  perform 1 from public.invoices where id = v_r.invoice_id for update;   -- lock order: invoice, wallet, shift
  select * into v_p from public.payments where id = v_r.payment_id;
  v_refundable := v_p.amount_minor - coalesce((select sum(amount_minor) from public.refunds
                     where payment_id = v_r.payment_id and status = 'approved'), 0);
  if v_r.amount_minor > v_refundable then perform public.raise_contract_error('PRECONDITION_FAILED', 'exceeds_refundable'); end if;

  if v_p.method = 'wallet' then
    select * into v_wt from public.wallet_transactions where payment_id = v_p.id and kind = 'payment';
    select * into v_w from public.wallets where id = v_wt.wallet_id for update;
    v_new := v_w.balance_minor + v_r.amount_minor;
    update public.wallets set balance_minor = v_new where id = v_w.id;
    insert into public.wallet_transactions (wallet_id, hall_id, kind, amount_minor, balance_after_minor, invoice_id, payment_id, refund_id, actor_id)
    values (v_w.id, v_w.hall_id, 'refund', v_r.amount_minor, v_new, v_r.invoice_id, v_p.id, v_r.id, auth.uid());
  else
    -- Cash leaves the drawer: it must be recorded in an open shift.
    v_sh := public.lock_open_shift(v_r.hall_id);
    if public.shift_expected_minor(v_sh.id) < v_r.amount_minor then
      perform public.raise_contract_error('PRECONDITION_FAILED', 'exceeds_drawer');
    end if;
    select currency into v_cur from public.invoices where id = v_r.invoice_id;
    insert into public.cash_movements (hall_id, shift_id, kind, amount_minor, currency, refund_id, created_by)
    values (v_r.hall_id, v_sh.id, 'cash_refund', -v_r.amount_minor, v_cur, v_r.id, auth.uid());
  end if;

  update public.invoices set refunded_minor = refunded_minor + v_r.amount_minor where id = v_r.invoice_id;
  update public.refunds set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), '')
   where id = p_refund_id;
  perform public.write_audit(v_r.hall_id, 'refund.approve', 'refund', p_refund_id::text, nullif(btrim(p_note), ''), null,
    jsonb_build_object('payment_id', v_p.id, 'method', v_p.method, 'amount_minor', v_r.amount_minor, 'shift_id', v_sh.id,
                       'self_approved', v_r.requested_by = auth.uid()));
end $$;
