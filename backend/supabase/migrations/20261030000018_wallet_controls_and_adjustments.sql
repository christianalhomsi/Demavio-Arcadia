-- Wallet controls, write-offs and payment detail (plan WAL-004/005, FIN-005, FIN-008).
--
-- Decisions (DEC-P15..P17):
--  * Freezing and withdrawing are owner actions (`wallet.withdraw`, already owner-only in the role matrix).
--    A frozen wallet cannot be topped up, spent or withdrawn from. A reason is always required.
--  * A withdrawal is cash paid back to the customer from the open shift. It is recorded as a ledger entry
--    (kind 'withdrawal') and as a drawer 'payout', so the shift count stays right. It is one owner step
--    with a reason; there is no second approver because only owners hold the permission.
--  * A write-off removes some or all of what is still owed on an invoice (bad debt). It is an
--    append-only record with a reason, needs `payment.adjust`, and never touches money already paid.

set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Ledger: withdrawals with a reason
-- ---------------------------------------------------------------------------

do $$
declare v_con text;
begin
  select c.conname into v_con from pg_constraint c
   where c.conrelid = 'public.wallet_transactions'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%top_up%';
  if v_con is not null then
    execute format('alter table public.wallet_transactions drop constraint %I', v_con);
  end if;
end $$;
alter table public.wallet_transactions
  add constraint wallet_transactions_kind_check check (kind in ('top_up', 'payment', 'refund', 'withdrawal')),
  add column reason text check (reason is null or length(reason) <= 300);

drop function public.list_wallet_ledger(uuid, int, int);
create function public.list_wallet_ledger(p_wallet_id uuid, p_limit int default 25, p_offset int default 0)
returns table (id uuid, kind text, amount_minor bigint, balance_after_minor bigint, invoice_id uuid, actor_name text,
               created_at timestamptz, total bigint, reason text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_hall uuid;
begin
  select w.hall_id into v_hall from public.wallets w where w.id = p_wallet_id;
  if v_hall is null or not public.has_hall_permission(v_hall, 'wallet.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select t.id, t.kind, t.amount_minor, t.balance_after_minor, t.invoice_id, coalesce(p.display_name, p.email),
           t.created_at, count(*) over (), t.reason
      from public.wallet_transactions t left join public.profiles p on p.id = t.actor_id
     where t.wallet_id = p_wallet_id
     order by t.created_at desc, t.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Freeze / unfreeze
-- ---------------------------------------------------------------------------

create function public.set_wallet_status(p_wallet_id uuid, p_frozen boolean, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_w public.wallets; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_w from public.wallets where id = p_wallet_id for update;
  if not found or not public.has_hall_permission(v_w.hall_id, 'wallet.withdraw') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_frozen is null then perform public.raise_contract_error('VALIDATION', 'status'); end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  if (v_w.status = 'frozen') = p_frozen then return; end if; -- retry-safe

  update public.wallets set status = case when p_frozen then 'frozen' else 'active' end where id = p_wallet_id;
  perform public.write_audit(v_w.hall_id, case when p_frozen then 'wallet.freeze' else 'wallet.unfreeze' end,
    'wallet', p_wallet_id::text, v_reason,
    jsonb_build_object('status', v_w.status),
    jsonb_build_object('status', case when p_frozen then 'frozen' else 'active' end));
end $$;

-- ---------------------------------------------------------------------------
-- Withdrawal (cash back to the customer from the open shift)
-- ---------------------------------------------------------------------------

create function public.withdraw_from_wallet(p_wallet_id uuid, p_amount_minor bigint, p_reason text, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_w public.wallets; v_existing public.wallet_transactions; v_tx uuid; v_new bigint; v_s public.hall_settings;
        v_sh public.shifts; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_w from public.wallets where id = p_wallet_id for update;
  if not found or not public.has_hall_permission(v_w.hall_id, 'wallet.withdraw') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;

  select * into v_existing from public.wallet_transactions where actor_id = auth.uid() and idempotency_key = p_key;
  if found then
    if v_existing.wallet_id <> p_wallet_id or v_existing.amount_minor <> -p_amount_minor or v_existing.kind <> 'withdrawal' then
      perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch');
    end if;
    return v_existing.id;
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 100000000 then
    perform public.raise_contract_error('VALIDATION', 'amount');
  end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  select * into v_s from public.hall_settings where hall_id = v_w.hall_id;
  if not ('cash' = any (v_s.payment_methods)) then perform public.raise_contract_error('PRECONDITION_FAILED', 'method_disabled'); end if;
  if v_w.status <> 'active' then perform public.raise_contract_error('PRECONDITION_FAILED', 'wallet_frozen'); end if;
  if v_w.balance_minor < p_amount_minor then perform public.raise_contract_error('INSUFFICIENT_FUNDS'); end if;

  v_sh := public.lock_open_shift(v_w.hall_id);
  if public.shift_expected_minor(v_sh.id) < p_amount_minor then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'exceeds_drawer');
  end if;

  v_new := v_w.balance_minor - p_amount_minor;
  update public.wallets set balance_minor = v_new where id = p_wallet_id;
  insert into public.wallet_transactions (wallet_id, hall_id, kind, amount_minor, balance_after_minor, actor_id, idempotency_key, reason)
  values (p_wallet_id, v_w.hall_id, 'withdrawal', -p_amount_minor, v_new, auth.uid(), p_key, v_reason) returning id into v_tx;

  insert into public.cash_movements (hall_id, shift_id, kind, amount_minor, currency, reason, created_by)
  values (v_w.hall_id, v_sh.id, 'payout', -p_amount_minor, v_w.currency, 'Wallet withdrawal: ' || left(v_reason, 250), auth.uid());

  perform public.write_audit(v_w.hall_id, 'wallet.withdraw', 'wallet', p_wallet_id::text, v_reason,
    jsonb_build_object('balance_minor', v_w.balance_minor),
    jsonb_build_object('balance_minor', v_new, 'amount_minor', p_amount_minor, 'shift_id', v_sh.id));
  return v_tx;
end $$;

-- ---------------------------------------------------------------------------
-- Write-offs
-- ---------------------------------------------------------------------------

create table public.invoice_adjustments (
  id               uuid primary key default gen_random_uuid(),
  hall_id          uuid not null references public.halls (id),
  invoice_id       uuid not null,
  kind             text not null check (kind in ('write_off')),
  amount_minor     bigint not null check (amount_minor > 0),
  total_before     bigint not null,
  total_after      bigint not null check (total_after >= 0),
  reason           text not null check (length(btrim(reason)) between 3 and 300),
  created_by       uuid references public.profiles (id),
  idempotency_key  uuid,
  created_at       timestamptz not null default now(),
  foreign key (invoice_id, hall_id) references public.invoices (id, hall_id)
);
create index invoice_adjustments_hall_idx on public.invoice_adjustments (hall_id, created_at desc);
create index invoice_adjustments_invoice_idx on public.invoice_adjustments (invoice_id);
create unique index invoice_adjustments_idem_idx on public.invoice_adjustments (created_by, idempotency_key)
  where idempotency_key is not null;
create trigger invoice_adjustments_immutable before update or delete on public.invoice_adjustments
  for each row execute function public.forbid_change();

alter table public.invoice_adjustments enable row level security;
create policy invoice_adjustments_select on public.invoice_adjustments for select to authenticated
  using (public.has_hall_permission(hall_id, 'payment.adjust') or public.has_hall_permission(hall_id, 'invoice.view'));
grant select on public.invoice_adjustments to authenticated;

-- p_amount_minor null = everything still owed.
create function public.write_off_invoice(p_invoice_id uuid, p_amount_minor bigint, p_reason text, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_i public.invoices; v_existing public.invoice_adjustments; v_id uuid; v_amount bigint; v_final bigint;
        v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_i from public.invoices where id = p_invoice_id for update;
  if not found or not public.has_hall_permission(v_i.hall_id, 'payment.adjust') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;

  select * into v_existing from public.invoice_adjustments where created_by = auth.uid() and idempotency_key = p_key;
  if found then
    if v_existing.invoice_id <> p_invoice_id then perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch'); end if;
    return v_existing.id;
  end if;

  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  if v_i.status = 'voided' then perform public.raise_contract_error('PRECONDITION_FAILED', 'invoice_voided'); end if;
  if v_i.status = 'paid' or v_i.outstanding_minor <= 0 then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'already_paid');
  end if;
  v_amount := coalesce(p_amount_minor, v_i.outstanding_minor);
  if v_amount <= 0 then perform public.raise_contract_error('VALIDATION', 'amount'); end if;
  if v_amount > v_i.outstanding_minor then perform public.raise_contract_error('PRECONDITION_FAILED', 'exceeds_outstanding'); end if;

  v_final := v_i.total_minor - v_amount;
  insert into public.invoice_adjustments (hall_id, invoice_id, kind, amount_minor, total_before, total_after, reason, created_by, idempotency_key)
  values (v_i.hall_id, v_i.id, 'write_off', v_amount, v_i.total_minor, v_final, v_reason, auth.uid(), p_key)
  returning id into v_id;

  insert into public.invoice_items (invoice_id, hall_id, description, amount_minor, detail)
  values (v_i.id, v_i.hall_id, 'Write-off', -v_amount, jsonb_build_object('kind', 'write_off', 'adjustment_id', v_id));

  update public.invoices
     set total_minor = v_final,
         status = case when paid_minor >= v_final then 'paid' when paid_minor > 0 then 'partially_paid' else status end
   where id = v_i.id;

  perform public.write_audit(v_i.hall_id, 'invoice.write_off', 'invoice', v_i.id::text, v_reason,
    jsonb_build_object('total_minor', v_i.total_minor),
    jsonb_build_object('total_minor', v_final, 'amount_minor', v_amount));
  return v_id;
end $$;

-- Everything that reduced what customers owe, newest first: write-offs, discounts and voids.
create function public.list_adjustments(p_hall_id uuid, p_limit int default 25, p_offset int default 0)
returns table (kind text, invoice_id uuid, invoice_number text, amount_minor bigint, currency char(3), reason text,
               actor_name text, created_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'payment.adjust') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    with a as (
      select 'write_off'::text as k, x.invoice_id as inv, x.amount_minor as amt, x.reason as why, x.created_by as who, x.created_at as at
        from public.invoice_adjustments x where x.hall_id = p_hall_id
      union all
      select 'discount', d.invoice_id, d.amount_minor, d.reason, d.applied_by, d.created_at
        from public.invoice_discounts d where d.hall_id = p_hall_id
      union all
      select 'void', i.id, i.total_minor, i.void_reason, i.voided_by, i.voided_at
        from public.invoices i where i.hall_id = p_hall_id and i.status = 'voided' and i.voided_at is not null
    )
    select a.k, a.inv, i.number, a.amt, i.currency, a.why, coalesce(p.display_name, p.email), a.at, count(*) over ()
      from a join public.invoices i on i.id = a.inv
      left join public.profiles p on p.id = a.who
     order by a.at desc, a.inv
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Payment detail
-- ---------------------------------------------------------------------------

create function public.get_payment_detail(p_payment_id uuid)
returns table (id uuid, invoice_id uuid, invoice_number text, method text, amount_minor bigint, currency char(3),
               status text, operator_name text, shift_id uuid, customer_name text, created_at timestamptz,
               refunded_minor bigint, refund_pending_minor bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_hall uuid;
begin
  select pay.hall_id into v_hall from public.payments pay where pay.id = p_payment_id;
  if v_hall is null or not public.has_hall_permission(v_hall, 'invoice.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select pay.id, pay.invoice_id, i.number, pay.method, pay.amount_minor, pay.currency, pay.status,
           coalesce(op.display_name, op.email), pay.shift_id, coalesce(cu.display_name, cu.email), pay.created_at,
           coalesce((select sum(r.amount_minor) from public.refunds r where r.payment_id = pay.id and r.status = 'approved'), 0)::bigint,
           coalesce((select sum(r.amount_minor) from public.refunds r where r.payment_id = pay.id and r.status = 'pending'), 0)::bigint
      from public.payments pay
      join public.invoices i on i.id = pay.invoice_id
      left join public.profiles op on op.id = pay.created_by
      left join public.profiles cu on cu.id = i.customer_id
     where pay.id = p_payment_id;
end $$;

create function public.list_payment_refunds(p_payment_id uuid)
returns table (id uuid, amount_minor bigint, status text, reason_code text, note text, requested_by_name text,
               requested_at timestamptz, decided_by_name text, decided_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_hall uuid;
begin
  select pay.hall_id into v_hall from public.payments pay where pay.id = p_payment_id;
  if v_hall is null or not public.has_hall_permission(v_hall, 'invoice.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select r.id, r.amount_minor, r.status, r.reason_code, r.note, coalesce(rq.display_name, rq.email), r.requested_at,
           coalesce(dc.display_name, dc.email), r.decided_at
      from public.refunds r
      left join public.profiles rq on rq.id = r.requested_by
      left join public.profiles dc on dc.id = r.decided_by
     where r.payment_id = p_payment_id
     order by r.requested_at desc;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  public.list_wallet_ledger(uuid, int, int),
  public.set_wallet_status(uuid, boolean, text),
  public.withdraw_from_wallet(uuid, bigint, text, uuid),
  public.write_off_invoice(uuid, bigint, text, uuid),
  public.list_adjustments(uuid, int, int),
  public.get_payment_detail(uuid),
  public.list_payment_refunds(uuid)
  from public, anon, authenticated;
grant execute on function
  public.list_wallet_ledger(uuid, int, int),
  public.set_wallet_status(uuid, boolean, text),
  public.withdraw_from_wallet(uuid, bigint, text, uuid),
  public.write_off_invoice(uuid, bigint, text, uuid),
  public.list_adjustments(uuid, int, int),
  public.get_payment_detail(uuid),
  public.list_payment_refunds(uuid)
  to authenticated;
