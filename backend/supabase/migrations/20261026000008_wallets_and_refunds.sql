-- Hall-specific wallets, the wallet ledger, wallet payments and refunds (web phase W8; spec §12, §19).
--
-- Rules implemented (spec §12.2, §29):
--  * A wallet belongs to ONE player in ONE hall and one currency. Balances never cross halls.
--  * The ledger (wallet_transactions) is append-only. Balance changes happen only inside these
--    functions, under a row lock, and can never go negative (CHECK + explicit INSUFFICIENT_FUNDS).
--  * A top-up is stored value (a liability), not revenue. Revenue is recognised through invoices.
--  * Every money-moving function is idempotent per (actor, key) and writes an audit entry.
--  * Refunds go back to the ORIGINAL method only (wallet payment -> wallet credit; cash -> recorded
--    for the register). Alternative methods and withdrawals are pending decisions (DEC-07/DEC-08)
--    and are intentionally NOT implemented.
--
-- PROVISIONAL choices to confirm:
--  * A refund must be approved by someone other than its requester (separation of duties).
--    A hall with a single owner who is also the only person requesting would need a second approver.
--  * A wallet can pay an invoice with no customer attached (walk-in) because staff are physically
--    with the customer. If the invoice HAS a customer, the wallet must be theirs.
--  * Opening a wallet needs the customer's exact account email; the result does not say whether the
--    email exists beyond "not found".
--  * Cash is not linked to a shift/register yet (phase W9).
--
-- Lock order (to avoid deadlocks): invoice first, then wallet.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.wallets (
  id            uuid primary key default gen_random_uuid(),
  hall_id       uuid not null references public.halls (id),
  customer_id   uuid not null references public.profiles (id),
  currency      char(3) not null,
  status        text not null default 'active' check (status in ('active', 'frozen')),
  balance_minor bigint not null default 0 check (balance_minor >= 0),
  created_at    timestamptz not null default now(),
  unique (hall_id, customer_id)
);
create unique index wallets_id_hall_idx on public.wallets (id, hall_id);

create table public.wallet_transactions (
  id                   uuid primary key default gen_random_uuid(),
  wallet_id            uuid not null,
  hall_id              uuid not null,
  kind                 text not null check (kind in ('top_up', 'payment', 'refund')),
  amount_minor         bigint not null check (amount_minor <> 0),
  balance_after_minor  bigint not null check (balance_after_minor >= 0),
  invoice_id           uuid,
  payment_id           uuid,
  refund_id            uuid,
  actor_id             uuid references public.profiles (id),
  idempotency_key      uuid,
  created_at           timestamptz not null default now(),
  foreign key (wallet_id, hall_id) references public.wallets (id, hall_id)
);
create index wallet_transactions_wallet_idx on public.wallet_transactions (wallet_id, created_at desc);
create unique index wallet_transactions_idem_idx on public.wallet_transactions (actor_id, idempotency_key)
  where idempotency_key is not null;

create trigger wallet_transactions_immutable
  before update or delete on public.wallet_transactions
  for each row execute function public.forbid_change();

create table public.refunds (
  id               uuid primary key default gen_random_uuid(),
  hall_id          uuid not null,
  payment_id       uuid not null,
  invoice_id       uuid not null references public.invoices (id),
  amount_minor     bigint not null check (amount_minor > 0),
  reason_code      text not null check (reason_code in ('overcharge', 'service_issue', 'customer_request', 'other')),
  note             text check (note is null or length(note) <= 300),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by     uuid not null references public.profiles (id),
  requested_at     timestamptz not null default now(),
  idempotency_key  uuid,
  decided_by       uuid references public.profiles (id),
  decided_at       timestamptz,
  decision_note    text check (decision_note is null or length(decision_note) <= 300),
  foreign key (payment_id, hall_id) references public.payments (id, hall_id),
  check ((status = 'pending') = (decided_by is null))
);
create index refunds_hall_idx on public.refunds (hall_id, requested_at desc);
create index refunds_payment_idx on public.refunds (payment_id);
create unique index refunds_idem_idx on public.refunds (requested_by, idempotency_key) where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.wallets              enable row level security;
alter table public.wallet_transactions  enable row level security;
alter table public.refunds              enable row level security;

create policy wallets_select on public.wallets
  for select to authenticated using (public.has_hall_permission(hall_id, 'wallet.view'));
create policy wallet_transactions_select on public.wallet_transactions
  for select to authenticated using (public.has_hall_permission(hall_id, 'wallet.view'));
create policy refunds_select on public.refunds
  for select to authenticated using (
    public.has_hall_permission(hall_id, 'refund.request') or public.has_hall_permission(hall_id, 'refund.approve'));

grant select on public.wallets, public.wallet_transactions, public.refunds to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.wallets, public.refunds;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Wallets
-- ---------------------------------------------------------------------------

create function public.open_wallet(p_hall_id uuid, p_customer_email text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cust uuid; v_id uuid; v_cur char(3);
begin
  if not public.has_hall_permission(p_hall_id, 'wallet.top_up') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  select id into v_cust from public.profiles
   where lower(email) = lower(btrim(coalesce(p_customer_email, ''))) and status = 'active';
  if v_cust is null then perform public.raise_contract_error('NOT_FOUND'); end if;
  select currency into v_cur from public.halls where id = p_hall_id;

  insert into public.wallets (hall_id, customer_id, currency) values (p_hall_id, v_cust, v_cur)
    on conflict (hall_id, customer_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.wallets where hall_id = p_hall_id and customer_id = v_cust;
  else
    perform public.write_audit(p_hall_id, 'wallet.open', 'wallet', v_id::text, null, null, jsonb_build_object('customer_id', v_cust));
  end if;
  return v_id;
end $$;

-- Cash top-up. Stored value; never counted as gaming revenue.
create function public.wallet_top_up(p_wallet_id uuid, p_amount_minor bigint, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_w public.wallets; v_existing public.wallet_transactions; v_tx uuid; v_new bigint; v_s public.hall_settings;
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

  v_new := v_w.balance_minor + p_amount_minor;
  update public.wallets set balance_minor = v_new where id = p_wallet_id;
  insert into public.wallet_transactions (wallet_id, hall_id, kind, amount_minor, balance_after_minor, actor_id, idempotency_key)
  values (p_wallet_id, v_w.hall_id, 'top_up', p_amount_minor, v_new, auth.uid(), p_key) returning id into v_tx;

  perform public.write_audit(v_w.hall_id, 'wallet.top_up', 'wallet', p_wallet_id::text, null,
    jsonb_build_object('balance_minor', v_w.balance_minor), jsonb_build_object('balance_minor', v_new, 'amount_minor', p_amount_minor));
  return v_tx;
end $$;

create function public.pay_invoice_from_wallet(p_invoice_id uuid, p_wallet_id uuid, p_amount_minor bigint, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_i public.invoices; v_w public.wallets; v_s public.hall_settings; v_existing public.payments;
        v_pay uuid; v_tx uuid; v_new bigint;
begin
  select * into v_i from public.invoices where id = p_invoice_id for update;       -- lock order: invoice,
  if not found or not public.has_hall_permission(v_i.hall_id, 'payment.collect') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  select * into v_w from public.wallets where id = p_wallet_id for update;         -- then wallet
  if not found or v_w.hall_id <> v_i.hall_id then perform public.raise_contract_error('NOT_FOUND'); end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;

  select * into v_existing from public.payments where created_by = auth.uid() and idempotency_key = p_key;
  if found then
    if v_existing.invoice_id <> p_invoice_id or v_existing.amount_minor <> p_amount_minor or v_existing.method <> 'wallet' then
      perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch');
    end if;
    return v_existing.id;
  end if;

  select * into v_s from public.hall_settings where hall_id = v_i.hall_id;
  if not ('wallet' = any (v_s.payment_methods)) then perform public.raise_contract_error('PRECONDITION_FAILED', 'method_disabled'); end if;
  if v_w.status <> 'active' then perform public.raise_contract_error('PRECONDITION_FAILED', 'wallet_frozen'); end if;
  if v_w.currency <> v_i.currency then perform public.raise_contract_error('PRECONDITION_FAILED', 'currency_mismatch'); end if;
  if v_i.customer_id is not null and v_i.customer_id <> v_w.customer_id then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'wrong_customer');
  end if;
  if v_i.status = 'voided' then perform public.raise_contract_error('PRECONDITION_FAILED', 'invoice_voided'); end if;
  if v_i.status = 'paid' then perform public.raise_contract_error('PRECONDITION_FAILED', 'already_paid'); end if;
  if p_amount_minor is null or p_amount_minor <= 0 then perform public.raise_contract_error('VALIDATION', 'amount'); end if;
  if p_amount_minor > v_i.outstanding_minor then perform public.raise_contract_error('PRECONDITION_FAILED', 'exceeds_outstanding'); end if;
  if p_amount_minor < v_i.outstanding_minor and not v_s.allow_partial_payments then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'partial_not_allowed');
  end if;
  if v_w.balance_minor < p_amount_minor then perform public.raise_contract_error('INSUFFICIENT_FUNDS'); end if;

  v_new := v_w.balance_minor - p_amount_minor;
  update public.wallets set balance_minor = v_new where id = v_w.id;

  insert into public.payments (hall_id, invoice_id, method, amount_minor, currency, created_by, idempotency_key)
  values (v_i.hall_id, v_i.id, 'wallet', p_amount_minor, v_i.currency, auth.uid(), p_key) returning id into v_pay;

  insert into public.wallet_transactions (wallet_id, hall_id, kind, amount_minor, balance_after_minor, invoice_id, payment_id, actor_id, idempotency_key)
  values (v_w.id, v_w.hall_id, 'payment', -p_amount_minor, v_new, v_i.id, v_pay, auth.uid(), null) returning id into v_tx;
  -- payments are immutable, so the link is stored on the ledger side only.

  update public.invoices
     set paid_minor = paid_minor + p_amount_minor,
         status = case when paid_minor + p_amount_minor >= total_minor then 'paid' else 'partially_paid' end
   where id = v_i.id;

  perform public.write_audit(v_i.hall_id, 'payment.record', 'payment', v_pay::text, null, null,
    jsonb_build_object('invoice_id', v_i.id, 'method', 'wallet', 'amount_minor', p_amount_minor, 'wallet_id', v_w.id,
                       'wallet_owner_differs_from_invoice_customer', v_i.customer_id is null));
  return v_pay;
end $$;

create function public.list_wallets(p_hall_id uuid, p_search text default null, p_limit int default 25, p_offset int default 0, p_wallet_id uuid default null)
returns table (id uuid, customer_name text, customer_email text, currency char(3), status text, balance_minor bigint, last_activity timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'wallet.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select w.id, p.display_name, p.email, w.currency, w.status, w.balance_minor,
           (select max(t.created_at) from public.wallet_transactions t where t.wallet_id = w.id), count(*) over ()
      from public.wallets w join public.profiles p on p.id = w.customer_id
     where w.hall_id = p_hall_id and (p_wallet_id is null or w.id = p_wallet_id)
       and (p_search is null or p.display_name ilike '%' || p_search || '%' or p.email ilike '%' || p_search || '%')
     order by p.display_name nulls last, p.email
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.list_wallet_ledger(p_wallet_id uuid, p_limit int default 25, p_offset int default 0)
returns table (id uuid, kind text, amount_minor bigint, balance_after_minor bigint, invoice_id uuid, actor_name text, created_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_hall uuid;
begin
  select w.hall_id into v_hall from public.wallets w where w.id = p_wallet_id;
  if v_hall is null or not public.has_hall_permission(v_hall, 'wallet.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select t.id, t.kind, t.amount_minor, t.balance_after_minor, t.invoice_id, coalesce(p.display_name, p.email), t.created_at, count(*) over ()
      from public.wallet_transactions t left join public.profiles p on p.id = t.actor_id
     where t.wallet_id = p_wallet_id
     order by t.created_at desc, t.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Refunds (original method only)
-- ---------------------------------------------------------------------------

create function public.request_refund(p_payment_id uuid, p_amount_minor bigint, p_reason_code text, p_note text, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_p public.payments; v_existing public.refunds; v_refundable bigint; v_id uuid;
begin
  select * into v_p from public.payments where id = p_payment_id;
  if not found or not public.has_hall_permission(v_p.hall_id, 'refund.request') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
  -- Serialize requests per invoice so two concurrent requests cannot both fit the same refundable amount.
  perform 1 from public.invoices where id = v_p.invoice_id for update;

  select * into v_existing from public.refunds where requested_by = auth.uid() and idempotency_key = p_key;
  if found then
    if v_existing.payment_id <> p_payment_id or v_existing.amount_minor <> p_amount_minor then
      perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch');
    end if;
    return v_existing.id;
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then perform public.raise_contract_error('VALIDATION', 'amount'); end if;
  if p_reason_code not in ('overcharge', 'service_issue', 'customer_request', 'other') then
    perform public.raise_contract_error('VALIDATION', 'reason_code');
  end if;
  if p_reason_code = 'other' and (p_note is null or length(btrim(p_note)) = 0) then
    perform public.raise_contract_error('VALIDATION', 'note');
  end if;
  if p_note is not null and length(p_note) > 300 then perform public.raise_contract_error('VALIDATION', 'note'); end if;

  v_refundable := v_p.amount_minor - coalesce((select sum(amount_minor) from public.refunds
                     where payment_id = p_payment_id and status in ('pending', 'approved')), 0);
  if p_amount_minor > v_refundable then perform public.raise_contract_error('PRECONDITION_FAILED', 'exceeds_refundable'); end if;

  insert into public.refunds (hall_id, payment_id, invoice_id, amount_minor, reason_code, note, requested_by, idempotency_key)
  values (v_p.hall_id, v_p.id, v_p.invoice_id, p_amount_minor, p_reason_code, nullif(btrim(p_note), ''), auth.uid(), p_key)
  returning id into v_id;

  perform public.write_audit(v_p.hall_id, 'refund.request', 'refund', v_id::text, nullif(btrim(p_note), ''), null,
    jsonb_build_object('payment_id', v_p.id, 'amount_minor', p_amount_minor, 'reason_code', p_reason_code));
  return v_id;
end $$;

create function public.decide_refund(p_refund_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.refunds; v_p public.payments; v_w public.wallets; v_wt public.wallet_transactions; v_new bigint; v_refundable bigint;
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

  perform 1 from public.invoices where id = v_r.invoice_id for update;   -- lock order: invoice, then wallet
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
  end if;
  -- Cash refunds are recorded here and will be linked to the cash register in phase W9.

  update public.invoices set refunded_minor = refunded_minor + v_r.amount_minor where id = v_r.invoice_id;
  update public.refunds set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), '')
   where id = p_refund_id;
  perform public.write_audit(v_r.hall_id, 'refund.approve', 'refund', p_refund_id::text, nullif(btrim(p_note), ''), null,
    jsonb_build_object('payment_id', v_p.id, 'method', v_p.method, 'amount_minor', v_r.amount_minor));
end $$;

create function public.list_refunds(p_hall_id uuid, p_status text default null, p_limit int default 25, p_offset int default 0)
returns table (id uuid, payment_id uuid, invoice_id uuid, invoice_number text, method text, amount_minor bigint, currency char(3),
               reason_code text, note text, status text, requested_by_name text, requested_at timestamptz,
               decided_by_name text, decided_at timestamptz, decision_note text, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (public.has_hall_permission(p_hall_id, 'refund.request') or public.has_hall_permission(p_hall_id, 'refund.approve')) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select r.id, r.payment_id, r.invoice_id, i.number, pay.method, r.amount_minor, i.currency, r.reason_code, r.note, r.status,
           coalesce(rq.display_name, rq.email), r.requested_at, coalesce(dc.display_name, dc.email), r.decided_at, r.decision_note, count(*) over ()
      from public.refunds r
      join public.invoices i on i.id = r.invoice_id
      join public.payments pay on pay.id = r.payment_id
      join public.profiles rq on rq.id = r.requested_by
      left join public.profiles dc on dc.id = r.decided_by
     where r.hall_id = p_hall_id and (p_status is null or r.status = p_status)
     order by (r.status = 'pending') desc, r.requested_at desc, r.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.open_wallet(uuid, text), public.wallet_top_up(uuid, bigint, uuid),
  public.pay_invoice_from_wallet(uuid, uuid, bigint, uuid),
  public.list_wallets(uuid, text, int, int, uuid), public.list_wallet_ledger(uuid, int, int),
  public.request_refund(uuid, bigint, text, text, uuid), public.decide_refund(uuid, boolean, text),
  public.list_refunds(uuid, text, int, int)
  from public, anon, authenticated;

grant execute on function
  public.open_wallet(uuid, text), public.wallet_top_up(uuid, bigint, uuid),
  public.pay_invoice_from_wallet(uuid, uuid, bigint, uuid),
  public.list_wallets(uuid, text, int, int, uuid), public.list_wallet_ledger(uuid, int, int),
  public.request_refund(uuid, bigint, text, text, uuid), public.decide_refund(uuid, boolean, text),
  public.list_refunds(uuid, text, int, int)
  to authenticated;
