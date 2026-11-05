-- Registers, shifts, cash movements and basic financial reports (web phase W9; spec §13, §19, §26.1).
--
-- Rules implemented:
--  * One cash register per hall in the MVP (DEC-W08, provisional). It is created automatically.
--  * One OPEN shift per register at a time (partial unique index + row lock).
--  * Every cash payment, cash wallet top-up and approved cash refund is written to the hall's open shift
--    as a signed, append-only cash movement. With no open shift those operations are refused
--    ('no_open_shift'). Cash from any collector goes into the hall's single open shift (DEC-W13,
--    provisional).
--  * expected cash = opening cash + sum(movements). The total is computed here, never in the browser.
--  * Closing a shift is gated by unpaid invoices created since the shift opened (DEC-11, provisional).
--    The gate can be overridden only by a holder of payment.adjust, with a written reason. Both the
--    override and any counted-vs-expected difference are audited. A difference never blocks closing.
--  * Closed shifts and all movements are immutable; corrections are new movements in a later shift.
--  * Payouts and manual adjustments need payment.adjust (owner by default, provisional) and a reason.
--  * Reports keep accounting categories apart (spec §13.3): wallet top-ups are stored value (a
--    liability), NOT revenue; wallet payments settle that liability and are shown as a collection
--    method, not as new money; refunds, voids and register differences are separate lines.
--
-- Lock order: invoice, then wallet, then shift (shifts are taken FOR SHARE by money operations and FOR
-- UPDATE by close/open, so a payment can never land in a shift that is being closed).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.cash_registers (
  id         uuid primary key default gen_random_uuid(),
  hall_id    uuid not null references public.halls (id),
  name       text not null check (length(btrim(name)) between 1 and 60),
  status     text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  unique (id, hall_id)
);
create index cash_registers_hall_idx on public.cash_registers (hall_id);

create table public.shifts (
  id                  uuid primary key default gen_random_uuid(),
  hall_id             uuid not null references public.halls (id),
  register_id         uuid not null,
  currency            char(3) not null,
  status              text not null default 'open' check (status in ('open', 'closed')),
  opened_by           uuid not null references public.profiles (id),
  opened_at           timestamptz not null default now(),
  opening_cash_minor  bigint not null check (opening_cash_minor between 0 and 10000000000),
  open_key            uuid,
  closed_by           uuid references public.profiles (id),
  closed_at           timestamptz,
  close_key           uuid,
  counted_cash_minor  bigint check (counted_cash_minor between 0 and 10000000000),
  expected_cash_minor bigint,
  difference_minor    bigint,
  override_reason     text check (override_reason is null or length(override_reason) <= 300),
  unpaid_count        int,
  unpaid_minor        bigint,
  foreign key (register_id, hall_id) references public.cash_registers (id, hall_id),
  check ((status = 'closed') = (closed_at is not null and counted_cash_minor is not null
                                and expected_cash_minor is not null and difference_minor is not null))
);
create unique index shifts_id_hall_idx on public.shifts (id, hall_id);
create unique index shifts_one_open_per_register_idx on public.shifts (register_id) where status = 'open';
create unique index shifts_open_key_idx on public.shifts (opened_by, open_key) where open_key is not null;
create index shifts_hall_opened_idx on public.shifts (hall_id, opened_at desc);

create table public.cash_movements (
  id                    uuid primary key default gen_random_uuid(),
  hall_id               uuid not null,
  shift_id              uuid not null,
  kind                  text not null check (kind in ('cash_payment', 'wallet_top_up', 'cash_refund',
                                                      'payout', 'adjustment_in', 'adjustment_out')),
  amount_minor          bigint not null,                       -- signed: + into the drawer, - out of it
  currency              char(3) not null,
  reason                text check (reason is null or length(reason) <= 300),
  payment_id            uuid,
  wallet_transaction_id uuid,
  refund_id             uuid,
  created_by            uuid references public.profiles (id),
  idempotency_key       uuid,
  created_at            timestamptz not null default now(),
  foreign key (shift_id, hall_id) references public.shifts (id, hall_id),
  check (
    (kind in ('cash_payment', 'wallet_top_up', 'adjustment_in') and amount_minor > 0) or
    (kind in ('cash_refund', 'payout', 'adjustment_out') and amount_minor < 0)
  ),
  check (kind not in ('payout', 'adjustment_in', 'adjustment_out') or length(btrim(coalesce(reason, ''))) >= 3),
  check ((kind = 'cash_payment') = (payment_id is not null)),
  check ((kind = 'wallet_top_up') = (wallet_transaction_id is not null)),
  check ((kind = 'cash_refund') = (refund_id is not null))
);
create index cash_movements_shift_idx on public.cash_movements (shift_id, created_at);
create index cash_movements_hall_idx on public.cash_movements (hall_id, created_at desc);
create unique index cash_movements_payment_idx on public.cash_movements (payment_id) where payment_id is not null;
create unique index cash_movements_topup_idx on public.cash_movements (wallet_transaction_id) where wallet_transaction_id is not null;
create unique index cash_movements_refund_idx on public.cash_movements (refund_id) where refund_id is not null;
create unique index cash_movements_idem_idx on public.cash_movements (created_by, idempotency_key) where idempotency_key is not null;

create trigger cash_movements_immutable
  before update or delete on public.cash_movements
  for each row execute function public.forbid_change();

-- A shift may be changed only while open (open -> closed once); closed shifts and deletes are refused.
create function public.guard_shift_change() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' or old.status = 'closed' then
    raise exception 'closed shifts are immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger shifts_guard before update or delete on public.shifts
  for each row execute function public.guard_shift_change();

-- payments.shift_id was reserved in W8; it now points at the shift that took the cash.
alter table public.payments add constraint payments_shift_fk foreign key (shift_id) references public.shifts (id);

-- Every hall gets its single register (DEC-W08).
create function public.create_default_register() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.cash_registers (hall_id, name) values (new.id, 'Main register');
  return new;
end $$;
create trigger halls_default_register after insert on public.halls
  for each row execute function public.create_default_register();
insert into public.cash_registers (hall_id, name) select id, 'Main register' from public.halls;

-- ---------------------------------------------------------------------------
-- RLS (read-only for clients)
-- ---------------------------------------------------------------------------

alter table public.cash_registers enable row level security;
alter table public.shifts         enable row level security;
alter table public.cash_movements enable row level security;

create policy cash_registers_select on public.cash_registers
  for select to authenticated using (
    public.has_hall_permission(hall_id, 'shift.open') or public.has_hall_permission(hall_id, 'shift.close'));
create policy shifts_select on public.shifts
  for select to authenticated using (
    public.has_hall_permission(hall_id, 'shift.open') or public.has_hall_permission(hall_id, 'shift.close'));
create policy cash_movements_select on public.cash_movements
  for select to authenticated using (
    public.has_hall_permission(hall_id, 'shift.open') or public.has_hall_permission(hall_id, 'shift.close'));

-- Explicit, in case the default-privilege revoke from 0009 does not apply to the role running migrations.
revoke all on public.cash_registers, public.shifts, public.cash_movements from anon, authenticated;
grant select on public.cash_registers, public.shifts, public.cash_movements to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shifts;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Internal helpers (not exposed)
-- ---------------------------------------------------------------------------

create function public.shift_expected_minor(p_shift_id uuid) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select s.opening_cash_minor + coalesce((select sum(m.amount_minor) from public.cash_movements m where m.shift_id = s.id), 0)
    from public.shifts s where s.id = p_shift_id;
$$;

-- The hall's open shift, locked FOR SHARE so close_shift (FOR UPDATE) waits for in-flight money operations.
create function public.lock_open_shift(p_hall_id uuid) returns public.shifts
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sh public.shifts;
begin
  select * into v_sh from public.shifts where hall_id = p_hall_id and status = 'open' for share;
  if not found then perform public.raise_contract_error('PRECONDITION_FAILED', 'no_open_shift'); end if;
  return v_sh;
end $$;

-- ---------------------------------------------------------------------------
-- Money operations now write to the open shift (replace the W8 versions; signatures unchanged)
-- ---------------------------------------------------------------------------

create or replace function public.record_cash_payment(p_invoice_id uuid, p_amount_minor bigint, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_i public.invoices; v_s public.hall_settings; v_existing public.payments; v_id uuid; v_sh public.shifts;
begin
  -- Lock the invoice first: concurrent payments for one invoice are serialized, so the outstanding
  -- balance can never be exceeded (spec §19.2).
  select * into v_i from public.invoices where id = p_invoice_id for update;
  if not found or not public.has_hall_permission(v_i.hall_id, 'payment.collect') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;

  select * into v_existing from public.payments where created_by = auth.uid() and idempotency_key = p_key;
  if found then
    if v_existing.invoice_id <> p_invoice_id or v_existing.amount_minor <> p_amount_minor or v_existing.method <> 'cash' then
      perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch');
    end if;
    return v_existing.id;
  end if;

  select * into v_s from public.hall_settings where hall_id = v_i.hall_id;
  if not ('cash' = any (v_s.payment_methods)) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'method_disabled');
  end if;
  if v_i.status = 'voided' then perform public.raise_contract_error('PRECONDITION_FAILED', 'invoice_voided'); end if;
  if v_i.status = 'paid' then perform public.raise_contract_error('PRECONDITION_FAILED', 'already_paid'); end if;
  if p_amount_minor is null or p_amount_minor <= 0 then perform public.raise_contract_error('VALIDATION', 'amount'); end if;
  if p_amount_minor > v_i.outstanding_minor then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'exceeds_outstanding');
  end if;
  if p_amount_minor < v_i.outstanding_minor and not v_s.allow_partial_payments then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'partial_not_allowed');
  end if;
  v_sh := public.lock_open_shift(v_i.hall_id);

  insert into public.payments (hall_id, invoice_id, method, amount_minor, currency, created_by, idempotency_key, shift_id)
  values (v_i.hall_id, v_i.id, 'cash', p_amount_minor, v_i.currency, auth.uid(), p_key, v_sh.id)
  returning id into v_id;

  insert into public.cash_movements (hall_id, shift_id, kind, amount_minor, currency, payment_id, created_by)
  values (v_i.hall_id, v_sh.id, 'cash_payment', p_amount_minor, v_i.currency, v_id, auth.uid());

  update public.invoices
     set paid_minor = paid_minor + p_amount_minor,
         status = case when paid_minor + p_amount_minor >= total_minor then 'paid' else 'partially_paid' end
   where id = v_i.id;

  perform public.write_audit(v_i.hall_id, 'payment.record', 'payment', v_id::text, null, null,
    jsonb_build_object('invoice_id', v_i.id, 'method', 'cash', 'amount_minor', p_amount_minor,
                       'currency', v_i.currency, 'shift_id', v_sh.id));
  return v_id;
end $$;

-- Cash top-up. Stored value; never counted as gaming revenue. The cash enters the drawer (shift).
create or replace function public.wallet_top_up(p_wallet_id uuid, p_amount_minor bigint, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_w public.wallets; v_existing public.wallet_transactions; v_tx uuid; v_new bigint; v_s public.hall_settings;
        v_sh public.shifts;
begin
  select * into v_w from public.wallets where id = p_wallet_id for update;
  if not found or not public.has_hall_permission(v_w.hall_id, 'wallet.top_up') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;

  select * into v_existing from public.wallet_transactions where actor_id = auth.uid() and idempotency_key = p_key;
  if found then
    if v_existing.wallet_id <> p_wallet_id or v_existing.amount_minor <> p_amount_minor or v_existing.kind <> 'top_up' then
      perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch');
    end if;
    return v_existing.id;
  end if;

  select * into v_s from public.hall_settings where hall_id = v_w.hall_id;
  if not ('cash' = any (v_s.payment_methods)) then perform public.raise_contract_error('PRECONDITION_FAILED', 'method_disabled'); end if;
  if v_w.status <> 'active' then perform public.raise_contract_error('PRECONDITION_FAILED', 'wallet_frozen'); end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 100000000 then
    perform public.raise_contract_error('VALIDATION', 'amount');
  end if;
  v_sh := public.lock_open_shift(v_w.hall_id);

  v_new := v_w.balance_minor + p_amount_minor;
  update public.wallets set balance_minor = v_new where id = p_wallet_id;
  insert into public.wallet_transactions (wallet_id, hall_id, kind, amount_minor, balance_after_minor, actor_id, idempotency_key)
  values (p_wallet_id, v_w.hall_id, 'top_up', p_amount_minor, v_new, auth.uid(), p_key) returning id into v_tx;

  insert into public.cash_movements (hall_id, shift_id, kind, amount_minor, currency, wallet_transaction_id, created_by)
  values (v_w.hall_id, v_sh.id, 'wallet_top_up', p_amount_minor, v_w.currency, v_tx, auth.uid());

  perform public.write_audit(v_w.hall_id, 'wallet.top_up', 'wallet', p_wallet_id::text, null,
    jsonb_build_object('balance_minor', v_w.balance_minor),
    jsonb_build_object('balance_minor', v_new, 'amount_minor', p_amount_minor, 'shift_id', v_sh.id));
  return v_tx;
end $$;

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
  if v_r.requested_by = auth.uid() then perform public.raise_contract_error('PRECONDITION_FAILED', 'self_approval'); end if;
  if p_approve is null then perform public.raise_contract_error('VALIDATION', 'decision'); end if;
  if p_note is not null and length(p_note) > 300 then perform public.raise_contract_error('VALIDATION', 'note'); end if;

  if not p_approve then
    update public.refunds set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), '')
     where id = p_refund_id;
    perform public.write_audit(v_r.hall_id, 'refund.reject', 'refund', p_refund_id::text, nullif(btrim(p_note), ''), null, null);
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
    jsonb_build_object('payment_id', v_p.id, 'method', v_p.method, 'amount_minor', v_r.amount_minor, 'shift_id', v_sh.id));
end $$;

-- ---------------------------------------------------------------------------
-- Shift RPCs
-- ---------------------------------------------------------------------------

create function public.open_shift(p_hall_id uuid, p_register_id uuid, p_opening_cash_minor bigint, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_reg public.cash_registers; v_existing public.shifts; v_id uuid; v_cur char(3);
begin
  if not public.has_hall_permission(p_hall_id, 'shift.open') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;

  select * into v_existing from public.shifts where opened_by = auth.uid() and open_key = p_key;
  if found then
    if v_existing.hall_id <> p_hall_id or v_existing.opening_cash_minor <> p_opening_cash_minor then
      perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch');
    end if;
    return v_existing.id;
  end if;

  if p_opening_cash_minor is null or p_opening_cash_minor < 0 or p_opening_cash_minor > 10000000000 then
    perform public.raise_contract_error('VALIDATION', 'amount');
  end if;
  if p_register_id is null then
    select * into v_reg from public.cash_registers where hall_id = p_hall_id and status = 'active' order by created_at limit 1 for update;
  else
    select * into v_reg from public.cash_registers where id = p_register_id and hall_id = p_hall_id and status = 'active' for update;
  end if;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;

  if exists (select 1 from public.shifts where register_id = v_reg.id and status = 'open') then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'shift_already_open');
  end if;
  select currency into v_cur from public.halls where id = p_hall_id;

  insert into public.shifts (hall_id, register_id, currency, opened_by, opening_cash_minor, open_key)
  values (p_hall_id, v_reg.id, v_cur, auth.uid(), p_opening_cash_minor, p_key) returning id into v_id;

  perform public.write_audit(p_hall_id, 'shift.open', 'shift', v_id::text, null, null,
    jsonb_build_object('register_id', v_reg.id, 'opening_cash_minor', p_opening_cash_minor, 'currency', v_cur));
  return v_id;
end $$;

-- Unpaid invoices for the close gate. in_shift = created since this shift opened (blocks closing);
-- older outstanding invoices are listed for visibility but do not block (DEC-11, provisional).
create function public.get_shift_unpaid_summary(p_shift_id uuid)
returns table (invoice_id uuid, number text, session_id uuid, device_name text, customer_name text, ended_at timestamptz,
               total_minor bigint, outstanding_minor bigint, currency char(3), status text, in_shift boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_sh public.shifts;
begin
  select * into v_sh from public.shifts where id = p_shift_id;
  if not found or not public.has_hall_permission(v_sh.hall_id, 'shift.close') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select i.id, i.number, i.session_id, d.name, coalesce(i.guest_name, p.display_name, p.email), s.ended_at,
           i.total_minor, i.outstanding_minor, i.currency, i.status, i.created_at >= v_sh.opened_at
      from public.invoices i
      join public.sessions s on s.id = i.session_id
      join public.devices d on d.id = s.device_id
      left join public.profiles p on p.id = i.customer_id
     where i.hall_id = v_sh.hall_id and i.status in ('open', 'partially_paid') and i.outstanding_minor > 0
     order by (i.created_at >= v_sh.opened_at) desc, s.ended_at, i.id;
end $$;

create function public.close_shift(p_shift_id uuid, p_counted_cash_minor bigint, p_override_reason text, p_key uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sh public.shifts; v_expected bigint; v_unpaid_n int; v_unpaid_sum bigint; v_reason text := nullif(btrim(p_override_reason), '');
        v_diff bigint;
begin
  select * into v_sh from public.shifts where id = p_shift_id for update;
  if not found or not public.has_hall_permission(v_sh.hall_id, 'shift.close') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;

  if v_sh.status = 'closed' then
    -- Retry of the same close returns the stored result; anything else is refused.
    if v_sh.close_key = p_key and v_sh.closed_by = auth.uid() and v_sh.counted_cash_minor = p_counted_cash_minor then
      return jsonb_build_object('expected_minor', v_sh.expected_cash_minor, 'counted_minor', v_sh.counted_cash_minor,
                                'difference_minor', v_sh.difference_minor, 'overridden', v_sh.override_reason is not null,
                                'unpaid_count', v_sh.unpaid_count);
    end if;
    perform public.raise_contract_error('PRECONDITION_FAILED', 'already_closed');
  end if;

  if p_counted_cash_minor is null or p_counted_cash_minor < 0 or p_counted_cash_minor > 10000000000 then
    perform public.raise_contract_error('VALIDATION', 'amount');
  end if;
  if v_reason is not null and (length(v_reason) < 3 or length(v_reason) > 300) then
    perform public.raise_contract_error('VALIDATION', 'close_reason');
  end if;

  select count(*), coalesce(sum(i.outstanding_minor), 0) into v_unpaid_n, v_unpaid_sum
    from public.invoices i
   where i.hall_id = v_sh.hall_id and i.status in ('open', 'partially_paid') and i.outstanding_minor > 0
     and i.created_at >= v_sh.opened_at;

  if v_unpaid_n > 0 then
    if v_reason is null then
      perform public.raise_contract_error('PRECONDITION_FAILED', 'unpaid_invoices');
    end if;
    if not public.has_hall_permission(v_sh.hall_id, 'payment.adjust') then
      perform public.raise_contract_error('PERMISSION_DENIED', 'override');
    end if;
  else
    v_reason := null;          -- nothing to override: do not record a meaningless override
  end if;

  v_expected := public.shift_expected_minor(p_shift_id);
  v_diff := p_counted_cash_minor - v_expected;
  update public.shifts
     set status = 'closed', closed_by = auth.uid(), closed_at = now(), close_key = p_key,
         counted_cash_minor = p_counted_cash_minor, expected_cash_minor = v_expected, difference_minor = v_diff,
         override_reason = v_reason, unpaid_count = v_unpaid_n, unpaid_minor = v_unpaid_sum
   where id = p_shift_id;

  perform public.write_audit(v_sh.hall_id, 'shift.close', 'shift', p_shift_id::text, v_reason, null,
    jsonb_build_object('expected_minor', v_expected, 'counted_minor', p_counted_cash_minor, 'difference_minor', v_diff,
                       'unpaid_count', v_unpaid_n, 'unpaid_minor', v_unpaid_sum, 'overridden', v_reason is not null,
                       'currency', v_sh.currency));
  return jsonb_build_object('expected_minor', v_expected, 'counted_minor', p_counted_cash_minor,
                            'difference_minor', v_diff, 'overridden', v_reason is not null, 'unpaid_count', v_unpaid_n);
end $$;

-- Payouts and manual adjustments. p_kind: 'payout' | 'adjustment_in' | 'adjustment_out'; amount is positive.
create function public.record_cash_movement(p_shift_id uuid, p_kind text, p_amount_minor bigint, p_reason text, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_sh public.shifts; v_existing public.cash_movements; v_id uuid; v_signed bigint; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_sh from public.shifts where id = p_shift_id for update;
  if not found or not public.has_hall_permission(v_sh.hall_id, 'payment.adjust') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;

  select * into v_existing from public.cash_movements where created_by = auth.uid() and idempotency_key = p_key;
  if found then
    if v_existing.shift_id <> p_shift_id or v_existing.kind <> p_kind or abs(v_existing.amount_minor) <> p_amount_minor then
      perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch');
    end if;
    return v_existing.id;
  end if;

  if p_kind not in ('payout', 'adjustment_in', 'adjustment_out') then perform public.raise_contract_error('VALIDATION', 'kind'); end if;
  if p_amount_minor is null or p_amount_minor <= 0 or p_amount_minor > 10000000000 then
    perform public.raise_contract_error('VALIDATION', 'amount');
  end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  if v_sh.status <> 'open' then perform public.raise_contract_error('PRECONDITION_FAILED', 'shift_closed'); end if;

  v_signed := case when p_kind = 'adjustment_in' then p_amount_minor else -p_amount_minor end;
  if v_signed < 0 and public.shift_expected_minor(p_shift_id) + v_signed < 0 then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'exceeds_drawer');
  end if;

  insert into public.cash_movements (hall_id, shift_id, kind, amount_minor, currency, reason, created_by, idempotency_key)
  values (v_sh.hall_id, p_shift_id, p_kind, v_signed, v_sh.currency, v_reason, auth.uid(), p_key) returning id into v_id;

  perform public.write_audit(v_sh.hall_id, 'cash.' || p_kind, 'cash_movement', v_id::text, v_reason, null,
    jsonb_build_object('shift_id', p_shift_id, 'amount_minor', v_signed, 'currency', v_sh.currency));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

create function public.list_shifts(p_hall_id uuid, p_status text default null, p_limit int default 25, p_offset int default 0,
                                   p_shift_id uuid default null)
returns table (
  id uuid, register_id uuid, register_name text, status text, currency char(3),
  opened_by_name text, opened_at timestamptz, opening_cash_minor bigint,
  closed_by_name text, closed_at timestamptz, counted_cash_minor bigint, expected_cash_minor bigint, difference_minor bigint,
  override_reason text, unpaid_count int, unpaid_minor bigint,
  cash_payments_minor bigint, top_ups_minor bigint, cash_refunds_minor bigint, payouts_minor bigint, adjustments_minor bigint,
  active_sessions int, total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (public.has_hall_permission(p_hall_id, 'shift.open') or public.has_hall_permission(p_hall_id, 'shift.close')) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select s.id, s.register_id, r.name, s.status, s.currency,
           coalesce(po.display_name, po.email), s.opened_at, s.opening_cash_minor,
           coalesce(pc.display_name, pc.email), s.closed_at, s.counted_cash_minor,
           (s.opening_cash_minor + coalesce(a.net, 0))::bigint, s.difference_minor, s.override_reason, s.unpaid_count, s.unpaid_minor,
           coalesce(a.pay, 0)::bigint, coalesce(a.topup, 0)::bigint, coalesce(a.refund, 0)::bigint, coalesce(a.payout, 0)::bigint, coalesce(a.adj, 0)::bigint,
           case when s.status = 'open' then
             (select count(*)::int from public.sessions x where x.hall_id = s.hall_id and x.status in ('starting', 'in_progress'))
           else 0 end,
           count(*) over ()
      from public.shifts s
      join public.cash_registers r on r.id = s.register_id
      join public.profiles po on po.id = s.opened_by
      left join public.profiles pc on pc.id = s.closed_by
      left join lateral (
        select sum(m.amount_minor) as net,
               sum(m.amount_minor) filter (where m.kind = 'cash_payment') as pay,
               sum(m.amount_minor) filter (where m.kind = 'wallet_top_up') as topup,
               sum(m.amount_minor) filter (where m.kind = 'cash_refund') as refund,
               sum(m.amount_minor) filter (where m.kind = 'payout') as payout,
               sum(m.amount_minor) filter (where m.kind in ('adjustment_in', 'adjustment_out')) as adj
          from public.cash_movements m where m.shift_id = s.id) a on true
     where s.hall_id = p_hall_id and (p_shift_id is null or s.id = p_shift_id) and (p_status is null or s.status = p_status)
     order by (s.status = 'open') desc, s.opened_at desc, s.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.list_cash_movements(p_hall_id uuid, p_shift_id uuid default null, p_limit int default 25, p_offset int default 0)
returns table (id uuid, shift_id uuid, kind text, amount_minor bigint, currency char(3), reason text, invoice_number text,
               actor_name text, created_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (public.has_hall_permission(p_hall_id, 'shift.open') or public.has_hall_permission(p_hall_id, 'shift.close')) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select m.id, m.shift_id, m.kind, m.amount_minor, m.currency, m.reason,
           coalesce(i1.number, i2.number), coalesce(p.display_name, p.email), m.created_at, count(*) over ()
      from public.cash_movements m
      left join public.payments pay on pay.id = m.payment_id
      left join public.invoices i1 on i1.id = pay.invoice_id
      left join public.refunds rf on rf.id = m.refund_id
      left join public.invoices i2 on i2.id = rf.invoice_id
      left join public.profiles p on p.id = m.created_by
     where m.hall_id = p_hall_id and (p_shift_id is null or m.shift_id = p_shift_id)
     order by m.created_at desc, m.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.list_registers(p_hall_id uuid)
returns table (id uuid, name text, status text, open_shift_id uuid, open_since timestamptz, open_expected_cash_minor bigint, currency char(3))
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (public.has_hall_permission(p_hall_id, 'shift.open') or public.has_hall_permission(p_hall_id, 'shift.close')) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select r.id, r.name, r.status, s.id, s.opened_at,
           case when s.id is null then null else public.shift_expected_minor(s.id) end, h.currency
      from public.cash_registers r
      join public.halls h on h.id = r.hall_id
      left join public.shifts s on s.register_id = r.id and s.status = 'open'
     where r.hall_id = p_hall_id
     order by r.created_at;
end $$;

-- Basic financial/operational report for [p_from, p_to). Every figure is its own accounting category
-- (spec §13.3); nothing is netted silently. "As of now" figures are snapshots, not period figures.
create function public.report_financial_summary(p_hall_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  currency char(3),
  sessions_ended int, billable_seconds bigint,
  invoices_count int, invoiced_minor bigint, voided_minor bigint,
  collections_cash_minor bigint, collections_wallet_minor bigint,
  refunds_cash_minor bigint, refunds_wallet_minor bigint,
  wallet_top_ups_minor bigint,
  payouts_minor bigint, cash_adjustments_minor bigint,
  shifts_closed int, register_difference_minor bigint,
  outstanding_count int, outstanding_minor bigint, wallet_liability_minor bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'report.financial.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days' then
    perform public.raise_contract_error('VALIDATION', 'period');
  end if;
  return query
    select h.currency,
      (select count(*)::int from public.sessions s where s.hall_id = p_hall_id and s.ended_at >= p_from and s.ended_at < p_to),
      (select coalesce(sum(s.billable_seconds), 0)::bigint from public.sessions s where s.hall_id = p_hall_id and s.ended_at >= p_from and s.ended_at < p_to),
      (select count(*)::int from public.invoices i where i.hall_id = p_hall_id and i.status <> 'voided' and i.created_at >= p_from and i.created_at < p_to),
      (select coalesce(sum(i.total_minor), 0)::bigint from public.invoices i where i.hall_id = p_hall_id and i.status <> 'voided' and i.created_at >= p_from and i.created_at < p_to),
      (select coalesce(sum(i.total_minor), 0)::bigint from public.invoices i where i.hall_id = p_hall_id and i.status = 'voided' and i.voided_at >= p_from and i.voided_at < p_to),
      (select coalesce(sum(p.amount_minor), 0)::bigint from public.payments p where p.hall_id = p_hall_id and p.method = 'cash' and p.created_at >= p_from and p.created_at < p_to),
      (select coalesce(sum(p.amount_minor), 0)::bigint from public.payments p where p.hall_id = p_hall_id and p.method = 'wallet' and p.created_at >= p_from and p.created_at < p_to),
      (select coalesce(sum(r.amount_minor), 0)::bigint from public.refunds r join public.payments p on p.id = r.payment_id
        where r.hall_id = p_hall_id and r.status = 'approved' and p.method = 'cash' and r.decided_at >= p_from and r.decided_at < p_to),
      (select coalesce(sum(r.amount_minor), 0)::bigint from public.refunds r join public.payments p on p.id = r.payment_id
        where r.hall_id = p_hall_id and r.status = 'approved' and p.method = 'wallet' and r.decided_at >= p_from and r.decided_at < p_to),
      (select coalesce(sum(t.amount_minor), 0)::bigint from public.wallet_transactions t where t.hall_id = p_hall_id and t.kind = 'top_up' and t.created_at >= p_from and t.created_at < p_to),
      (select coalesce(-sum(m.amount_minor), 0)::bigint from public.cash_movements m where m.hall_id = p_hall_id and m.kind = 'payout' and m.created_at >= p_from and m.created_at < p_to),
      (select coalesce(sum(m.amount_minor), 0)::bigint from public.cash_movements m where m.hall_id = p_hall_id and m.kind in ('adjustment_in', 'adjustment_out') and m.created_at >= p_from and m.created_at < p_to),
      (select count(*)::int from public.shifts s where s.hall_id = p_hall_id and s.status = 'closed' and s.closed_at >= p_from and s.closed_at < p_to),
      (select coalesce(sum(s.difference_minor), 0)::bigint from public.shifts s where s.hall_id = p_hall_id and s.status = 'closed' and s.closed_at >= p_from and s.closed_at < p_to),
      (select count(*)::int from public.invoices i where i.hall_id = p_hall_id and i.outstanding_minor > 0),
      (select coalesce(sum(i.outstanding_minor), 0)::bigint from public.invoices i where i.hall_id = p_hall_id and i.outstanding_minor > 0),
      (select coalesce(sum(w.balance_minor), 0)::bigint from public.wallets w where w.hall_id = p_hall_id)
    from public.halls h where h.id = p_hall_id;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.guard_shift_change(), public.create_default_register(),
  public.shift_expected_minor(uuid), public.lock_open_shift(uuid),
  public.open_shift(uuid, uuid, bigint, uuid), public.get_shift_unpaid_summary(uuid),
  public.close_shift(uuid, bigint, text, uuid), public.record_cash_movement(uuid, text, bigint, text, uuid),
  public.list_shifts(uuid, text, int, int, uuid), public.list_cash_movements(uuid, uuid, int, int),
  public.list_registers(uuid), public.report_financial_summary(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

grant execute on function
  public.open_shift(uuid, uuid, bigint, uuid), public.get_shift_unpaid_summary(uuid),
  public.close_shift(uuid, bigint, text, uuid), public.record_cash_movement(uuid, text, bigint, text, uuid),
  public.list_shifts(uuid, text, int, int, uuid), public.list_cash_movements(uuid, uuid, int, int),
  public.list_registers(uuid), public.report_financial_summary(uuid, timestamptz, timestamptz)
  to authenticated;
