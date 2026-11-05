-- Pricing, session pricing snapshots, invoices and cash payments (web phase W8; spec §10, §11, §19).
--
-- Money rules (spec §10.2, §29): every amount is an integer in minor units with an explicit currency.
-- Nothing here uses floating point. The web only DISPLAYS these values; it never calculates them.
--
-- PROVISIONAL rules pending business decisions DEC-05 / DEC-10 (see WEB_RISKS_AND_DECISIONS.md):
--  * Billing = elapsed time rounded UP to whole minutes, then up to the hall's billing increment
--    (default 1 minute), never below the hall's minimum billable minutes (default 0), charged at the
--    hourly rate with the result rounded UP to the next minor unit.
--  * Rate precedence: device rule > category rule > hall rule. No rule at all = rate 0.
--  * No tax, discounts, packages or time-of-day windows yet.
--  * Cash payments are not yet linked to a shift (shifts arrive in phase W9; payments.shift_id is
--    reserved for it).
--
-- Principles kept from the spec: a reservation is not a session, a session is not an invoice, an
-- invoice is not a payment. Invoices are created from a session snapshot and never recalculated
-- from current rates. Financial history is append-only; corrections are separate records.

-- ---------------------------------------------------------------------------
-- Billing configuration and rates
-- ---------------------------------------------------------------------------

alter table public.hall_settings
  add column billing_increment_minutes int not null default 1 check (billing_increment_minutes between 1 and 60),
  add column min_billable_minutes      int not null default 0 check (min_billable_minutes between 0 and 240);

create table public.pricing_rules (
  id                   uuid primary key default gen_random_uuid(),
  hall_id              uuid not null references public.halls (id),
  scope                text not null check (scope in ('hall', 'category', 'device')),
  device_id            uuid,
  category             text check (category is null or length(btrim(category)) between 1 and 40),
  rate_per_hour_minor  bigint not null check (rate_per_hour_minor between 0 and 100000000),
  updated_by           uuid references public.profiles (id),
  updated_at           timestamptz not null default now(),
  foreign key (device_id, hall_id) references public.devices (id, hall_id),
  check (
    (scope = 'hall'     and device_id is null     and category is null) or
    (scope = 'category' and device_id is null     and category is not null) or
    (scope = 'device'   and device_id is not null and category is null)
  )
);
create unique index pricing_rules_hall_idx     on public.pricing_rules (hall_id) where scope = 'hall';
create unique index pricing_rules_category_idx on public.pricing_rules (hall_id, lower(category)) where scope = 'category';
create unique index pricing_rules_device_idx   on public.pricing_rules (device_id) where scope = 'device';

-- Immutable copy of the pricing configuration that applied when the session started (spec §10.2).
create table public.session_pricing_snapshots (
  session_id           uuid primary key references public.sessions (id),
  hall_id              uuid not null references public.halls (id),
  currency             char(3) not null,
  rate_per_hour_minor  bigint not null check (rate_per_hour_minor >= 0),
  rate_source          text not null check (rate_source in ('device', 'category', 'hall', 'none')),
  increment_minutes    int not null,
  min_billable_minutes int not null,
  captured_at          timestamptz not null default now()
);

create function public.forbid_change() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'P0001';
end $$;

create trigger session_pricing_snapshots_immutable
  before update or delete on public.session_pricing_snapshots
  for each row execute function public.forbid_change();

-- ---------------------------------------------------------------------------
-- Invoices and payments
-- ---------------------------------------------------------------------------

create table public.invoice_counters (
  hall_id      uuid primary key references public.halls (id),
  last_number  int not null default 0
);

create table public.invoices (
  id                    uuid primary key default gen_random_uuid(),
  hall_id               uuid not null references public.halls (id),
  session_id            uuid not null unique references public.sessions (id),
  number                text not null,
  customer_id           uuid references public.profiles (id),
  guest_name            text,
  currency              char(3) not null,
  billable_seconds      int not null check (billable_seconds >= 0),
  billed_minutes        int not null check (billed_minutes >= 0),
  rate_per_hour_minor   bigint not null check (rate_per_hour_minor >= 0),
  total_minor           bigint not null check (total_minor >= 0),
  paid_minor            bigint not null default 0 check (paid_minor >= 0),
  refunded_minor        bigint not null default 0 check (refunded_minor >= 0),
  status                text not null default 'open' check (status in ('open', 'partially_paid', 'paid', 'voided')),
  voided_at             timestamptz,
  voided_by             uuid references public.profiles (id),
  void_reason           text,
  created_at            timestamptz not null default now(),
  outstanding_minor     bigint generated always as (case when status = 'voided' then 0 else total_minor - paid_minor end) stored,
  unique (hall_id, number),
  check (paid_minor <= total_minor),
  check (refunded_minor <= paid_minor)
);
create unique index invoices_id_hall_idx on public.invoices (id, hall_id);
create index invoices_hall_created_idx on public.invoices (hall_id, created_at desc);
create index invoices_hall_status_idx on public.invoices (hall_id, status);

create table public.invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices (id),
  hall_id      uuid not null references public.halls (id),
  description  text not null,
  amount_minor bigint not null,
  detail       jsonb
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id);

create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  hall_id               uuid not null references public.halls (id),
  invoice_id            uuid not null,
  method                text not null check (method in ('cash', 'wallet')),
  amount_minor          bigint not null check (amount_minor > 0),
  currency              char(3) not null,
  status                text not null default 'succeeded' check (status = 'succeeded'),
  created_by            uuid references public.profiles (id),
  idempotency_key       uuid,
  wallet_transaction_id uuid,
  shift_id              uuid,
  created_at            timestamptz not null default now(),
  foreign key (invoice_id, hall_id) references public.invoices (id, hall_id)
);
create unique index payments_id_hall_idx on public.payments (id, hall_id);
create index payments_invoice_idx on public.payments (invoice_id);
create unique index payments_idem_idx on public.payments (created_by, idempotency_key) where idempotency_key is not null;

create trigger payments_immutable
  before update or delete on public.payments
  for each row execute function public.forbid_change();

-- ---------------------------------------------------------------------------
-- Calculation (trusted; the web never does this)
-- ---------------------------------------------------------------------------

create function public.compute_session_charge(
  p_rate_per_hour_minor bigint, p_seconds int, p_increment_minutes int, p_min_minutes int
) returns table (billed_minutes int, amount_minor bigint)
language sql immutable set search_path = public, pg_temp as $$
  with m as (
    select greatest(
             p_min_minutes,
             (((greatest(p_seconds, 0) + 59) / 60 + p_increment_minutes - 1) / p_increment_minutes) * p_increment_minutes
           ) as minutes
  )
  select m.minutes::int, ((p_rate_per_hour_minor * m.minutes + 59) / 60)::bigint from m;
$$;

create function public.capture_session_pricing() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_dev public.devices; v_rate bigint; v_source text := 'none'; v_s public.hall_settings; v_cur char(3);
begin
  select * into v_dev from public.devices where id = new.device_id;
  select * into v_s from public.hall_settings where hall_id = new.hall_id;
  select currency into v_cur from public.halls where id = new.hall_id;

  select rate_per_hour_minor into v_rate from public.pricing_rules where scope = 'device' and device_id = new.device_id;
  if found then v_source := 'device'; end if;
  if v_source = 'none' and v_dev.category is not null then
    select rate_per_hour_minor into v_rate from public.pricing_rules
     where hall_id = new.hall_id and scope = 'category' and lower(category) = lower(v_dev.category);
    if found then v_source := 'category'; end if;
  end if;
  if v_source = 'none' then
    select rate_per_hour_minor into v_rate from public.pricing_rules where hall_id = new.hall_id and scope = 'hall';
    if found then v_source := 'hall'; end if;
  end if;

  insert into public.session_pricing_snapshots
    (session_id, hall_id, currency, rate_per_hour_minor, rate_source, increment_minutes, min_billable_minutes)
  values (new.id, new.hall_id, v_cur, coalesce(v_rate, 0), v_source, v_s.billing_increment_minutes, v_s.min_billable_minutes);
  return new;
end $$;

create trigger sessions_capture_pricing
  after insert on public.sessions
  for each row execute function public.capture_session_pricing();

-- Sessions that already exist (none in a fresh database) get a zero-rate snapshot so invoicing never fails.
insert into public.session_pricing_snapshots (session_id, hall_id, currency, rate_per_hour_minor, rate_source, increment_minutes, min_billable_minutes)
select s.id, s.hall_id, h.currency, 0, 'none', 1, 0 from public.sessions s join public.halls h on h.id = s.hall_id
on conflict do nothing;

-- Creates the invoice for an ended session from its snapshot. Idempotent: one invoice per session.
create function public.finalize_session_invoice(p_session uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.sessions; v_snap public.session_pricing_snapshots; v_id uuid; v_num int; v_charge record;
begin
  select * into v_s from public.sessions where id = p_session;
  if not found or v_s.ended_at is null then
    raise exception 'session not ended' using errcode = 'P0001';
  end if;
  select id into v_id from public.invoices where session_id = p_session;
  if found then return v_id; end if;

  select * into v_snap from public.session_pricing_snapshots where session_id = p_session;
  select * into v_charge from public.compute_session_charge(
    v_snap.rate_per_hour_minor, v_s.billable_seconds, v_snap.increment_minutes, v_snap.min_billable_minutes);

  insert into public.invoice_counters (hall_id, last_number) values (v_s.hall_id, 1)
    on conflict (hall_id) do update set last_number = public.invoice_counters.last_number + 1
    returning last_number into v_num;

  insert into public.invoices
    (hall_id, session_id, number, customer_id, guest_name, currency, billable_seconds, billed_minutes,
     rate_per_hour_minor, total_minor, status)
  values (v_s.hall_id, p_session, 'INV-' || lpad(v_num::text, 6, '0'), v_s.customer_id, v_s.guest_name, v_snap.currency,
          v_s.billable_seconds, v_charge.billed_minutes, v_snap.rate_per_hour_minor, v_charge.amount_minor,
          case when v_charge.amount_minor = 0 then 'paid' else 'open' end)
  returning id into v_id;

  insert into public.invoice_items (invoice_id, hall_id, description, amount_minor, detail)
  values (v_id, v_s.hall_id, 'Gaming session', v_charge.amount_minor,
          jsonb_build_object('billed_minutes', v_charge.billed_minutes, 'billable_seconds', v_s.billable_seconds,
                             'rate_per_hour_minor', v_snap.rate_per_hour_minor, 'rate_source', v_snap.rate_source));

  insert into public.session_events (session_id, hall_id, event_type, actor_id, detail)
  values (p_session, v_s.hall_id, 'invoice_created', auth.uid(), jsonb_build_object('invoice_id', v_id));
  perform public.write_audit(v_s.hall_id, 'invoice.create', 'invoice', v_id::text, null, null,
    jsonb_build_object('session_id', p_session, 'total_minor', v_charge.amount_minor, 'currency', v_snap.currency));
  return v_id;
end $$;

-- end_session now creates the invoice (replaces the W7 'invoice_pending' placeholder). The invoice is
-- OPEN: ending a session never records a payment or marks anything paid.
create or replace function public.end_session(p_id uuid, p_end_type text, p_reason text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.sessions; v_seconds int; v_status text;
begin
  select * into v_s from public.sessions where id = p_id for update;
  if not found or not public.has_hall_permission(v_s.hall_id, 'session.end') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_end_type not in ('normal', 'interrupted', 'administrative') then
    perform public.raise_contract_error('VALIDATION', 'end_type');
  end if;
  if p_end_type <> 'normal' and (p_reason is null or length(btrim(p_reason)) = 0) then
    perform public.raise_contract_error('VALIDATION', 'reason');
  end if;
  if p_end_type = 'administrative' and not public.has_hall_permission(v_s.hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED', 'administrative_end');
  end if;

  if v_s.ended_at is not null then
    if v_s.end_type = p_end_type then return v_s.billable_seconds; end if;
    perform public.raise_contract_error('PRECONDITION_FAILED', 'already_ended');
  end if;
  if v_s.status not in ('starting', 'in_progress') then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'not_endable');
  end if;

  v_seconds := greatest(0, extract(epoch from (now() - v_s.started_at))::int);
  v_status := case when p_end_type = 'interrupted' then 'interrupted' else 'completed' end;
  update public.sessions
     set status = v_status, ended_at = now(), end_type = p_end_type, billable_seconds = v_seconds, ended_by = auth.uid()
   where id = p_id;

  insert into public.session_events (session_id, hall_id, event_type, actor_id, reason, detail)
  values (p_id, v_s.hall_id, 'ended', auth.uid(), nullif(btrim(p_reason), ''),
          jsonb_build_object('end_type', p_end_type, 'billable_seconds', v_seconds));
  perform public.finalize_session_invoice(p_id);
  perform public.queue_agent_command(v_s.device_id, 'END_SESSION', p_id);
  perform public.write_audit(v_s.hall_id, 'session.end', 'session', p_id::text, nullif(btrim(p_reason), ''), null,
    jsonb_build_object('end_type', p_end_type, 'billable_seconds', v_seconds));
  return v_seconds;
end $$;

-- ---------------------------------------------------------------------------
-- RLS (read-only for clients)
-- ---------------------------------------------------------------------------

alter table public.pricing_rules             enable row level security;
alter table public.session_pricing_snapshots enable row level security;
alter table public.invoice_counters          enable row level security;
alter table public.invoices                  enable row level security;
alter table public.invoice_items             enable row level security;
alter table public.payments                  enable row level security;

create policy pricing_rules_select on public.pricing_rules
  for select to authenticated using (public.has_hall_permission(hall_id, 'hall.settings.manage'));
create policy snapshots_select on public.session_pricing_snapshots
  for select to authenticated using (public.has_hall_permission(hall_id, 'invoice.view'));
create policy invoices_select on public.invoices
  for select to authenticated using (public.has_hall_permission(hall_id, 'invoice.view'));
create policy invoice_items_select on public.invoice_items
  for select to authenticated using (public.has_hall_permission(hall_id, 'invoice.view'));
create policy payments_select on public.payments
  for select to authenticated using (public.has_hall_permission(hall_id, 'invoice.view'));
-- invoice_counters: no policy, no grant (internal).

grant select on public.pricing_rules, public.session_pricing_snapshots, public.invoices,
  public.invoice_items, public.payments to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.invoices, public.payments;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.set_pricing_rate(
  p_hall_id uuid, p_scope text, p_device_id uuid, p_category text, p_rate_minor bigint
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_before bigint; v_cat text := nullif(btrim(p_category), '');
begin
  if not public.has_hall_permission(p_hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_scope not in ('hall', 'category', 'device') then
    perform public.raise_contract_error('VALIDATION', 'scope');
  end if;
  if p_rate_minor is null or p_rate_minor < 0 or p_rate_minor > 100000000 then
    perform public.raise_contract_error('VALIDATION', 'rate');
  end if;
  if p_scope = 'device' and not exists (select 1 from public.devices where id = p_device_id and hall_id = p_hall_id) then
    perform public.raise_contract_error('NOT_FOUND');
  end if;
  if (p_scope = 'category' and v_cat is null) then
    perform public.raise_contract_error('VALIDATION', 'category');
  end if;

  select id, rate_per_hour_minor into v_id, v_before from public.pricing_rules
   where hall_id = p_hall_id and scope = p_scope
     and (p_scope = 'hall' or (p_scope = 'device' and device_id = p_device_id) or (p_scope = 'category' and lower(category) = lower(v_cat)))
   for update;

  if v_id is null then
    insert into public.pricing_rules (hall_id, scope, device_id, category, rate_per_hour_minor, updated_by)
    values (p_hall_id, p_scope,
            case when p_scope = 'device' then p_device_id end,
            case when p_scope = 'category' then v_cat end,
            p_rate_minor, auth.uid())
    returning id into v_id;
  else
    update public.pricing_rules set rate_per_hour_minor = p_rate_minor, updated_by = auth.uid(), updated_at = now() where id = v_id;
  end if;

  -- Existing sessions keep their snapshot; this only affects sessions that start from now on.
  perform public.write_audit(p_hall_id, 'pricing.rate.set', 'pricing_rule', v_id::text, null,
    jsonb_build_object('rate_per_hour_minor', v_before),
    jsonb_build_object('scope', p_scope, 'device_id', p_device_id, 'category', v_cat, 'rate_per_hour_minor', p_rate_minor));
  return v_id;
end $$;

create function public.delete_pricing_rate(p_rule_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.pricing_rules;
begin
  select * into v_r from public.pricing_rules where id = p_rule_id for update;
  if not found or not public.has_hall_permission(v_r.hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  delete from public.pricing_rules where id = p_rule_id;
  perform public.write_audit(v_r.hall_id, 'pricing.rate.delete', 'pricing_rule', p_rule_id::text, null,
    jsonb_build_object('scope', v_r.scope, 'rate_per_hour_minor', v_r.rate_per_hour_minor), null);
end $$;

create function public.update_billing_rules(p_hall_id uuid, p_increment_minutes int, p_min_minutes int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb;
begin
  if not public.has_hall_permission(p_hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  select jsonb_build_object('increment', billing_increment_minutes, 'min', min_billable_minutes)
    into v_before from public.hall_settings where hall_id = p_hall_id for update;
  begin
    update public.hall_settings set billing_increment_minutes = p_increment_minutes,
           min_billable_minutes = p_min_minutes, updated_at = now() where hall_id = p_hall_id;
  exception when check_violation or not_null_violation then
    perform public.raise_contract_error('VALIDATION');
  end;
  perform public.write_audit(p_hall_id, 'pricing.billing_rules.update', 'hall_settings', p_hall_id::text, null, v_before,
    jsonb_build_object('increment', p_increment_minutes, 'min', p_min_minutes));
end $$;

create function public.list_pricing(p_hall_id uuid)
returns table (id uuid, scope text, device_id uuid, device_name text, category text, rate_per_hour_minor bigint,
               currency char(3), increment_minutes int, min_billable_minutes int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select r.id, r.scope, r.device_id, d.name, r.category, r.rate_per_hour_minor, h.currency,
           hs.billing_increment_minutes, hs.min_billable_minutes
      from public.pricing_rules r
      join public.halls h on h.id = r.hall_id
      join public.hall_settings hs on hs.hall_id = r.hall_id
      left join public.devices d on d.id = r.device_id
     where r.hall_id = p_hall_id
     order by case r.scope when 'hall' then 0 when 'category' then 1 else 2 end, r.category, d.name;
end $$;

create function public.list_invoices(
  p_hall_id uuid, p_status text default null, p_outstanding_only boolean default false,
  p_limit int default 25, p_offset int default 0, p_invoice_id uuid default null
)
returns table (
  id uuid, number text, session_id uuid, device_name text, customer_name text, currency char(3),
  total_minor bigint, paid_minor bigint, refunded_minor bigint, outstanding_minor bigint, status text,
  billable_seconds int, billed_minutes int, created_at timestamptz, total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'invoice.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select i.id, i.number, i.session_id, d.name, coalesce(i.guest_name, p.display_name, p.email), i.currency,
           i.total_minor, i.paid_minor, i.refunded_minor, i.outstanding_minor, i.status,
           i.billable_seconds, i.billed_minutes, i.created_at, count(*) over ()
      from public.invoices i
      join public.sessions s on s.id = i.session_id
      join public.devices d on d.id = s.device_id
      left join public.profiles p on p.id = i.customer_id
     where i.hall_id = p_hall_id
       and (p_invoice_id is null or i.id = p_invoice_id)
       and (p_status is null or i.status = p_status)
       and (not p_outstanding_only or i.outstanding_minor > 0)
     order by i.created_at desc, i.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.record_cash_payment(p_invoice_id uuid, p_amount_minor bigint, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_i public.invoices; v_s public.hall_settings; v_existing public.payments; v_id uuid;
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

  insert into public.payments (hall_id, invoice_id, method, amount_minor, currency, created_by, idempotency_key)
  values (v_i.hall_id, v_i.id, 'cash', p_amount_minor, v_i.currency, auth.uid(), p_key)
  returning id into v_id;

  update public.invoices
     set paid_minor = paid_minor + p_amount_minor,
         status = case when paid_minor + p_amount_minor >= total_minor then 'paid' else 'partially_paid' end
   where id = v_i.id;

  perform public.write_audit(v_i.hall_id, 'payment.record', 'payment', v_id::text, null, null,
    jsonb_build_object('invoice_id', v_i.id, 'method', 'cash', 'amount_minor', p_amount_minor, 'currency', v_i.currency));
  return v_id;
end $$;

-- Voiding is for mistakes on unpaid invoices. Paid invoices are corrected through refunds/adjustments.
create function public.void_invoice(p_invoice_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_i public.invoices;
begin
  select * into v_i from public.invoices where id = p_invoice_id for update;
  if not found or not public.has_hall_permission(v_i.hall_id, 'payment.adjust') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 300 then
    perform public.raise_contract_error('VALIDATION', 'reason');
  end if;
  if v_i.status = 'voided' then return; end if;
  if v_i.paid_minor > 0 then perform public.raise_contract_error('PRECONDITION_FAILED', 'has_payments'); end if;
  update public.invoices set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = p_invoice_id;
  perform public.write_audit(v_i.hall_id, 'invoice.void', 'invoice', p_invoice_id::text, btrim(p_reason),
    jsonb_build_object('status', v_i.status, 'total_minor', v_i.total_minor), jsonb_build_object('status', 'voided'));
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.forbid_change(), public.compute_session_charge(bigint, int, int, int), public.capture_session_pricing(),
  public.finalize_session_invoice(uuid),
  public.set_pricing_rate(uuid, text, uuid, text, bigint), public.delete_pricing_rate(uuid),
  public.update_billing_rules(uuid, int, int), public.list_pricing(uuid),
  public.list_invoices(uuid, text, boolean, int, int, uuid),
  public.record_cash_payment(uuid, bigint, uuid), public.void_invoice(uuid, text),
  public.end_session(uuid, text, text)
  from public, anon, authenticated;

grant execute on function
  public.set_pricing_rate(uuid, text, uuid, text, bigint), public.delete_pricing_rate(uuid),
  public.update_billing_rules(uuid, int, int), public.list_pricing(uuid),
  public.list_invoices(uuid, text, boolean, int, int, uuid),
  public.record_cash_payment(uuid, bigint, uuid), public.void_invoice(uuid, text),
  public.end_session(uuid, text, text)
  to authenticated;
