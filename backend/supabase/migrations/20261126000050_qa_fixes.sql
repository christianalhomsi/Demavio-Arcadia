-- Fixes from the QA pass of 2026-11-16.
--
-- 1. Discounts: the same discount can be applied to an invoice only once, and an employee's discount limit
--    covers everything they discounted on that invoice, not each application on its own (stacking several
--    small discounts used to get around the limit).
-- 2. Refunds: whoever requested a refund may withdraw it (reject their own request). Approving your own
--    request is still refused, unless nobody else in the hall can approve refunds (a hall with one owner),
--    where the request used to stay pending forever.
-- 3. Sessions: a session cannot start on a device that has no price at all (no device, category or hall
--    rate). It used to start and be billed at 0 without any warning.

-- ---------------------------------------------------------------------------
-- 1. apply_discount
-- ---------------------------------------------------------------------------
create or replace function public.apply_discount(p_invoice_id uuid, p_discount_id uuid, p_reason text, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_i public.invoices; v_d public.discounts; v_m public.hall_memberships; v_existing public.invoice_discounts;
        v_id uuid; v_gross bigint; v_amount bigint; v_final bigint; v_reason text := btrim(coalesce(p_reason, ''));
        v_mine bigint;
begin
  select * into v_i from public.invoices where id = p_invoice_id for update;
  if not found or not public.has_hall_permission(v_i.hall_id, 'discount.apply') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;

  select * into v_existing from public.invoice_discounts where applied_by = auth.uid() and idempotency_key = p_key;
  if found then
    if v_existing.invoice_id <> p_invoice_id or v_existing.discount_id is distinct from p_discount_id then
      perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch');
    end if;
    return v_existing.id;
  end if;

  if length(v_reason) < 1 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  if v_i.status = 'voided' then perform public.raise_contract_error('PRECONDITION_FAILED', 'invoice_voided'); end if;
  if v_i.status = 'paid' or v_i.outstanding_minor <= 0 then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'already_paid');
  end if;

  select * into v_d from public.discounts where id = p_discount_id and hall_id = v_i.hall_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if not v_d.active then perform public.raise_contract_error('PRECONDITION_FAILED', 'discount_inactive'); end if;
  if (v_d.valid_from is not null and now() < v_d.valid_from) or (v_d.valid_until is not null and now() >= v_d.valid_until) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'discount_not_valid');
  end if;
  if exists (select 1 from public.invoice_discounts where invoice_id = v_i.id and discount_id = v_d.id) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'discount_already_applied');
  end if;
  if v_d.max_uses is not null and (select count(*) from public.invoice_discounts where discount_id = v_d.id) >= v_d.max_uses then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'discount_exhausted');
  end if;

  -- Percent applies to the invoice's gross (before any discount); amount discounts are fixed.
  select v_i.total_minor + coalesce(sum(amount_minor), 0) into v_gross
    from public.invoice_discounts where invoice_id = v_i.id;
  v_amount := case when v_d.kind = 'percent' then (v_gross * v_d.value) / 10000 else v_d.value end;
  if v_amount <= 0 then perform public.raise_contract_error('VALIDATION', 'value'); end if;
  if v_amount > v_i.outstanding_minor then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'exceeds_outstanding');
  end if;

  -- Owner is unlimited. Anyone else needs a configured limit, which covers all they discounted on this invoice.
  select * into v_m from public.hall_memberships
   where hall_id = v_i.hall_id and user_id = auth.uid() and status = 'active';
  if v_m.role_key <> 'owner' then
    select coalesce(sum(amount_minor), 0) into v_mine
      from public.invoice_discounts where invoice_id = v_i.id and applied_by = auth.uid();
    if v_m.discount_limit_minor is null or v_mine + v_amount > v_m.discount_limit_minor then
      perform public.raise_contract_error('PRECONDITION_FAILED', 'exceeds_discount_limit');
    end if;
  end if;

  v_final := v_i.total_minor - v_amount;
  insert into public.invoice_discounts
    (hall_id, invoice_id, discount_id, name, kind, value, original_minor, amount_minor, final_minor, reason,
     applied_by, idempotency_key)
  values (v_i.hall_id, v_i.id, v_d.id, v_d.name, v_d.kind, v_d.value, v_i.total_minor, v_amount, v_final, v_reason,
          auth.uid(), p_key)
  returning id into v_id;

  insert into public.invoice_items (invoice_id, hall_id, description, amount_minor, detail)
  values (v_i.id, v_i.hall_id, v_d.name, -v_amount,
          jsonb_build_object('kind', 'discount', 'discount_id', v_d.id, 'discount_kind', v_d.kind, 'value', v_d.value));

  update public.invoices
     set total_minor = v_final,
         status = case when paid_minor >= v_final then 'paid' when paid_minor > 0 then 'partially_paid' else status end
   where id = v_i.id;

  perform public.write_audit(v_i.hall_id, 'discount.apply', 'invoice', v_i.id::text, v_reason,
    jsonb_build_object('total_minor', v_i.total_minor),
    jsonb_build_object('total_minor', v_final, 'discount', v_d.name, 'amount_minor', v_amount));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 2. decide_refund
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. capture_session_pricing: refuse a session on a device with no price
-- ---------------------------------------------------------------------------
create or replace function public.capture_session_pricing() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rate bigint; v_source text; v_s public.hall_settings; v_cur char(3); v_tz text;
begin
  select * into v_s from public.hall_settings where hall_id = new.hall_id;
  select currency, time_zone into v_cur, v_tz from public.halls where id = new.hall_id;
  select x.rate_per_hour_minor, x.rate_source into v_rate, v_source
    from public.resolve_device_rate(new.device_id, new.players_count) x;

  -- An explicit rate of 0 (free play) is fine; no rate at all is a setup mistake.
  if coalesce(v_source, 'none') = 'none' then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'no_rate');
  end if;

  insert into public.session_pricing_snapshots
    (session_id, hall_id, currency, rate_per_hour_minor, rate_source, increment_minutes, min_billable_minutes,
     windows, time_zone)
  values (new.id, new.hall_id, v_cur, coalesce(v_rate, 0), coalesce(v_source, 'none'),
          v_s.billing_increment_minutes, v_s.min_billable_minutes,
          public.resolve_device_windows(new.device_id), coalesce(v_tz, 'UTC'));
  return new;
end $$;
