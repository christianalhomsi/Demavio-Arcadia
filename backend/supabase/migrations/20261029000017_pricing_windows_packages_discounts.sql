-- Advanced pricing: time windows, packages, discounts (plan PRC-002/003/004; spec §10, §14).
--
-- Decisions (DEC-P12..P14):
--  * Windows are per day-of-week time ranges (hall time zone) with their own hourly rate. A session is
--    billed per segment: every billed minute uses the rate of the window it falls in, else the base rate.
--    Windows come from the most specific scope that has any (device > category > hall) and are copied
--    into the session snapshot at start, so later edits never change a running or past session.
--  * A package is a fixed price for a fixed duration. Time beyond the duration is billed at the regular
--    hourly rate; a customer who wants more package time starts another package session.
--  * Discounts are append-only records on an invoice. The owner has no limit; an employee is limited by
--    their configured discount limit per discount. Original, discount and final amounts are kept.

set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (key, description) values
  ('package.manage',  'Create, edit and deactivate packages'),
  ('discount.manage', 'Create, edit and deactivate discounts'),
  ('discount.apply',  'Apply a discount to an unpaid invoice (employees are bounded by their limit)');
insert into public.role_permissions (role_key, permission_key) values
  ('owner', 'package.manage'),
  ('owner', 'discount.manage'),
  ('owner', 'discount.apply'),
  ('employee', 'discount.apply');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.pricing_windows (
  id                   uuid primary key default gen_random_uuid(),
  hall_id              uuid not null references public.halls (id),
  scope                text not null check (scope in ('hall', 'category', 'device')),
  device_id            uuid,
  category             text check (category is null or length(btrim(category)) between 1 and 40),
  days                 int[] not null check (cardinality(days) between 1 and 7 and days <@ array[1,2,3,4,5,6,7]),
  start_minute         int not null check (start_minute between 0 and 1439),
  end_minute           int not null check (end_minute between 1 and 1440),
  rate_per_hour_minor  bigint not null check (rate_per_hour_minor between 0 and 100000000),
  updated_by           uuid references public.profiles (id),
  updated_at           timestamptz not null default now(),
  foreign key (device_id, hall_id) references public.devices (id, hall_id),
  check (end_minute > start_minute),
  check (
    (scope = 'hall'     and device_id is null     and category is null) or
    (scope = 'category' and device_id is null     and category is not null) or
    (scope = 'device'   and device_id is not null and category is null)
  )
);
create index pricing_windows_hall_idx on public.pricing_windows (hall_id);

alter table public.session_pricing_snapshots
  add column windows   jsonb not null default '[]',
  add column time_zone text  not null default 'UTC';

create table public.packages (
  id               uuid primary key default gen_random_uuid(),
  hall_id          uuid not null references public.halls (id),
  name             text not null check (length(btrim(name)) between 1 and 60),
  duration_minutes int  not null check (duration_minutes between 5 and 720),
  price_minor      bigint not null check (price_minor between 0 and 100000000),
  device_id        uuid,
  category         text check (category is null or length(btrim(category)) between 1 and 40),
  from_minute      int check (from_minute is null or from_minute between 0 and 1439),
  to_minute        int check (to_minute is null or to_minute between 1 and 1440),
  valid_from       timestamptz,
  valid_until      timestamptz,
  max_uses         int check (max_uses is null or max_uses >= 1),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (device_id, hall_id) references public.devices (id, hall_id),
  check ((from_minute is null) = (to_minute is null)),
  check (from_minute is null or to_minute > from_minute),
  check (valid_from is null or valid_until is null or valid_until > valid_from),
  check (device_id is null or category is null)
);
create unique index packages_hall_name_idx on public.packages (hall_id, lower(name));
create unique index packages_id_hall_idx on public.packages (id, hall_id);

create table public.package_uses (
  id               uuid primary key default gen_random_uuid(),
  hall_id          uuid not null references public.halls (id),
  package_id       uuid not null,
  session_id       uuid not null unique references public.sessions (id),
  name             text not null,
  duration_minutes int not null,
  price_minor      bigint not null,
  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  foreign key (package_id, hall_id) references public.packages (id, hall_id)
);
create index package_uses_package_idx on public.package_uses (package_id, created_at desc);
create trigger package_uses_immutable before update or delete on public.package_uses
  for each row execute function public.forbid_change();

create table public.discounts (
  id          uuid primary key default gen_random_uuid(),
  hall_id     uuid not null references public.halls (id),
  name        text not null check (length(btrim(name)) between 1 and 60),
  kind        text not null check (kind in ('amount', 'percent')),
  value       bigint not null check (value >= 1),
  valid_from  timestamptz,
  valid_until timestamptz,
  max_uses    int check (max_uses is null or max_uses >= 1),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((kind = 'amount' and value <= 100000000) or (kind = 'percent' and value <= 10000)),
  check (valid_from is null or valid_until is null or valid_until > valid_from)
);
create unique index discounts_hall_name_idx on public.discounts (hall_id, lower(name));
create unique index discounts_id_hall_idx on public.discounts (id, hall_id);

create table public.invoice_discounts (
  id               uuid primary key default gen_random_uuid(),
  hall_id          uuid not null references public.halls (id),
  invoice_id       uuid not null,
  discount_id      uuid,
  name             text not null,
  kind             text not null,
  value            bigint not null,
  original_minor   bigint not null,
  amount_minor     bigint not null check (amount_minor > 0),
  final_minor      bigint not null check (final_minor >= 0),
  reason           text not null check (length(btrim(reason)) between 1 and 300),
  applied_by       uuid references public.profiles (id),
  idempotency_key  uuid,
  created_at       timestamptz not null default now(),
  foreign key (invoice_id, hall_id) references public.invoices (id, hall_id),
  foreign key (discount_id, hall_id) references public.discounts (id, hall_id)
);
create index invoice_discounts_invoice_idx on public.invoice_discounts (invoice_id);
create index invoice_discounts_discount_idx on public.invoice_discounts (discount_id);
create unique index invoice_discounts_idem_idx on public.invoice_discounts (applied_by, idempotency_key)
  where idempotency_key is not null;
create trigger invoice_discounts_immutable before update or delete on public.invoice_discounts
  for each row execute function public.forbid_change();

alter table public.pricing_windows   enable row level security;
alter table public.packages          enable row level security;
alter table public.package_uses      enable row level security;
alter table public.discounts         enable row level security;
alter table public.invoice_discounts enable row level security;

create policy pricing_windows_select on public.pricing_windows for select to authenticated
  using (public.has_hall_permission(hall_id, 'hall.settings.manage'));
create policy packages_select on public.packages for select to authenticated
  using (public.has_hall_permission(hall_id, 'package.manage') or public.has_hall_permission(hall_id, 'session.start'));
create policy package_uses_select on public.package_uses for select to authenticated
  using (public.has_hall_permission(hall_id, 'package.manage'));
create policy discounts_select on public.discounts for select to authenticated
  using (public.has_hall_permission(hall_id, 'discount.manage') or public.has_hall_permission(hall_id, 'discount.apply'));
create policy invoice_discounts_select on public.invoice_discounts for select to authenticated
  using (public.has_hall_permission(hall_id, 'invoice.view'));

grant select on public.pricing_windows, public.packages, public.package_uses, public.discounts,
  public.invoice_discounts to authenticated;

-- ---------------------------------------------------------------------------
-- Window resolution + snapshot capture
-- ---------------------------------------------------------------------------

-- Windows of the most specific scope that has any, as snapshot JSON: [{days,start,end,rate}].
create function public.resolve_device_windows(p_device uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_dev public.devices; v_w jsonb;
begin
  select * into v_dev from public.devices where id = p_device;
  if not found then return '[]'; end if;

  select jsonb_agg(jsonb_build_object('days', to_jsonb(w.days), 'start', w.start_minute, 'end', w.end_minute,
                                      'rate', w.rate_per_hour_minor) order by w.start_minute, w.id)
    into v_w from public.pricing_windows w where w.scope = 'device' and w.device_id = p_device;
  if v_w is not null then return v_w; end if;

  if v_dev.category is not null then
    select jsonb_agg(jsonb_build_object('days', to_jsonb(w.days), 'start', w.start_minute, 'end', w.end_minute,
                                        'rate', w.rate_per_hour_minor) order by w.start_minute, w.id)
      into v_w from public.pricing_windows w
     where w.hall_id = v_dev.hall_id and w.scope = 'category' and lower(w.category) = lower(v_dev.category);
    if v_w is not null then return v_w; end if;
  end if;

  select jsonb_agg(jsonb_build_object('days', to_jsonb(w.days), 'start', w.start_minute, 'end', w.end_minute,
                                      'rate', w.rate_per_hour_minor) order by w.start_minute, w.id)
    into v_w from public.pricing_windows w where w.hall_id = v_dev.hall_id and w.scope = 'hall';
  return coalesce(v_w, '[]');
end $$;

create or replace function public.capture_session_pricing() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rate bigint; v_source text; v_s public.hall_settings; v_cur char(3); v_tz text;
begin
  select * into v_s from public.hall_settings where hall_id = new.hall_id;
  select currency, time_zone into v_cur, v_tz from public.halls where id = new.hall_id;
  select x.rate_per_hour_minor, x.rate_source into v_rate, v_source
    from public.resolve_device_rate(new.device_id, new.players_count) x;

  insert into public.session_pricing_snapshots
    (session_id, hall_id, currency, rate_per_hour_minor, rate_source, increment_minutes, min_billable_minutes,
     windows, time_zone)
  values (new.id, new.hall_id, v_cur, coalesce(v_rate, 0), coalesce(v_source, 'none'),
          v_s.billing_increment_minutes, v_s.min_billable_minutes,
          public.resolve_device_windows(new.device_id), coalesce(v_tz, 'UTC'));
  return new;
end $$;

-- Rate of one minute: the matching window's rate, else the base rate.
create function public.rate_at(p_at timestamptz, p_base bigint, p_windows jsonb, p_tz text) returns bigint
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(
    (select (w ->> 'rate')::bigint
       from jsonb_array_elements(p_windows) w,
            lateral (select p_at at time zone p_tz as l) t
      where (w -> 'days') @> to_jsonb(extract(isodow from t.l)::int)
        and (extract(hour from t.l)::int * 60 + extract(minute from t.l)::int) >= (w ->> 'start')::int
        and (extract(hour from t.l)::int * 60 + extract(minute from t.l)::int) <  (w ->> 'end')::int
      limit 1),
    p_base);
$$;

-- Per-segment charge: one row per distinct rate, in order of first use.
create function public.compute_segments(
  p_start timestamptz, p_minutes int, p_base bigint, p_windows jsonb, p_tz text
) returns table (rate_per_hour_minor bigint, minutes int, amount_minor bigint)
language sql immutable set search_path = public, pg_temp as $$
  with m as (
    select g, public.rate_at(p_start + make_interval(mins => g), p_base, p_windows, p_tz) as r
      from generate_series(0, greatest(p_minutes, 0) - 1) g
  )
  select r, count(*)::int, ((r * count(*) + 59) / 60)::bigint
    from m group by r order by min(g);
$$;

-- ---------------------------------------------------------------------------
-- Invoice finalization: session segments (or package + overtime) + product lines
-- ---------------------------------------------------------------------------

create or replace function public.finalize_session_invoice(p_session uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.sessions; v_snap public.session_pricing_snapshots; v_id uuid; v_num int; v_charge record;
        v_items bigint; v_total bigint; v_pkg public.package_uses; v_over int; v_overmin int := 0;
        v_time bigint := 0; v_billed int; v_seg record;
begin
  select * into v_s from public.sessions where id = p_session;
  if not found or v_s.ended_at is null then
    raise exception 'session not ended' using errcode = 'P0001';
  end if;
  select id into v_id from public.invoices where session_id = p_session;
  if found then return v_id; end if;

  select * into v_snap from public.session_pricing_snapshots where session_id = p_session;
  select * into v_pkg from public.package_uses where session_id = p_session;

  if v_pkg.id is not null then
    v_over := greatest(0, coalesce(v_s.billable_seconds, 0) - v_pkg.duration_minutes * 60);
    if v_over > 0 then
      select billed_minutes into v_overmin from public.compute_session_charge(
        v_snap.rate_per_hour_minor, v_over, v_snap.increment_minutes, 0);
    end if;
    v_billed := v_pkg.duration_minutes + v_overmin;
    select coalesce(sum(amount_minor), 0) into v_time from public.compute_segments(
      v_s.started_at + make_interval(mins => v_pkg.duration_minutes), v_overmin,
      v_snap.rate_per_hour_minor, v_snap.windows, v_snap.time_zone);
    v_time := v_time + v_pkg.price_minor;
  else
    select * into v_charge from public.compute_session_charge(
      v_snap.rate_per_hour_minor, v_s.billable_seconds, v_snap.increment_minutes, v_snap.min_billable_minutes);
    v_billed := v_charge.billed_minutes;
    select coalesce(sum(amount_minor), 0) into v_time from public.compute_segments(
      v_s.started_at, v_billed, v_snap.rate_per_hour_minor, v_snap.windows, v_snap.time_zone);
  end if;

  select coalesce(sum(unit_price_minor * quantity), 0) into v_items
    from public.session_items where session_id = p_session and removed_at is null;
  v_total := v_time + v_items;

  insert into public.invoice_counters (hall_id, last_number) values (v_s.hall_id, 1)
    on conflict (hall_id) do update set last_number = public.invoice_counters.last_number + 1
    returning last_number into v_num;

  insert into public.invoices
    (hall_id, session_id, number, customer_id, guest_name, currency, billable_seconds, billed_minutes,
     rate_per_hour_minor, total_minor, status)
  values (v_s.hall_id, p_session, 'INV-' || lpad(v_num::text, 6, '0'), v_s.customer_id, v_s.guest_name, v_snap.currency,
          v_s.billable_seconds, v_billed, v_snap.rate_per_hour_minor, v_total,
          case when v_total = 0 then 'paid' else 'open' end)
  returning id into v_id;

  if v_pkg.id is not null then
    insert into public.invoice_items (invoice_id, hall_id, description, amount_minor, detail)
    values (v_id, v_s.hall_id, v_pkg.name, v_pkg.price_minor,
            jsonb_build_object('kind', 'package', 'package_id', v_pkg.package_id,
                               'duration_minutes', v_pkg.duration_minutes));
    for v_seg in select * from public.compute_segments(
        v_s.started_at + make_interval(mins => v_pkg.duration_minutes), v_overmin,
        v_snap.rate_per_hour_minor, v_snap.windows, v_snap.time_zone) loop
      insert into public.invoice_items (invoice_id, hall_id, description, amount_minor, detail)
      values (v_id, v_s.hall_id, 'Extra time', v_seg.amount_minor,
              jsonb_build_object('kind', 'session', 'billed_minutes', v_seg.minutes,
                                 'billable_seconds', v_s.billable_seconds,
                                 'rate_per_hour_minor', v_seg.rate_per_hour_minor, 'rate_source', v_snap.rate_source,
                                 'overtime', true));
    end loop;
  else
    for v_seg in select * from public.compute_segments(
        v_s.started_at, v_billed, v_snap.rate_per_hour_minor, v_snap.windows, v_snap.time_zone) loop
      insert into public.invoice_items (invoice_id, hall_id, description, amount_minor, detail)
      values (v_id, v_s.hall_id, 'Gaming session', v_seg.amount_minor,
              jsonb_build_object('kind', 'session', 'billed_minutes', v_seg.minutes,
                                 'billable_seconds', v_s.billable_seconds,
                                 'rate_per_hour_minor', v_seg.rate_per_hour_minor, 'rate_source', v_snap.rate_source));
    end loop;
    if v_billed = 0 then
      insert into public.invoice_items (invoice_id, hall_id, description, amount_minor, detail)
      values (v_id, v_s.hall_id, 'Gaming session', 0,
              jsonb_build_object('kind', 'session', 'billed_minutes', 0, 'billable_seconds', v_s.billable_seconds,
                                 'rate_per_hour_minor', v_snap.rate_per_hour_minor, 'rate_source', v_snap.rate_source));
    end if;
  end if;

  insert into public.invoice_items (invoice_id, hall_id, description, amount_minor, detail)
  select v_id, v_s.hall_id, i.name, i.unit_price_minor * i.quantity,
         jsonb_build_object('kind', 'product', 'product_id', i.product_id, 'quantity', i.quantity,
                            'unit_price_minor', i.unit_price_minor)
    from public.session_items i
   where i.session_id = p_session and i.removed_at is null
   order by i.created_at, i.id;

  insert into public.session_events (session_id, hall_id, event_type, actor_id, detail)
  values (p_session, v_s.hall_id, 'invoice_created', auth.uid(), jsonb_build_object('invoice_id', v_id));
  perform public.write_audit(v_s.hall_id, 'invoice.create', 'invoice', v_id::text, null, null,
    jsonb_build_object('session_id', p_session, 'total_minor', v_total, 'items_minor', v_items,
                       'currency', v_snap.currency));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Windows RPCs
-- ---------------------------------------------------------------------------

create function public.list_pricing_windows(p_hall_id uuid)
returns table (id uuid, scope text, device_id uuid, device_name text, category text, days int[],
               start_minute int, end_minute int, rate_per_hour_minor bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select w.id, w.scope, w.device_id, d.name, w.category, w.days, w.start_minute, w.end_minute, w.rate_per_hour_minor
      from public.pricing_windows w left join public.devices d on d.id = w.device_id
     where w.hall_id = p_hall_id
     order by w.scope, d.name, w.category, w.start_minute;
end $$;

create function public.upsert_pricing_window(
  p_hall_id uuid, p_id uuid, p_scope text, p_device_id uuid, p_category text,
  p_days int[], p_start int, p_end int, p_rate_minor bigint
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_cat text := nullif(btrim(p_category), '');
begin
  if not public.has_hall_permission(p_hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_scope is null or p_scope not in ('hall', 'category', 'device') then
    perform public.raise_contract_error('VALIDATION', 'scope');
  end if;
  if p_days is null or cardinality(p_days) not between 1 and 7 or not (p_days <@ array[1,2,3,4,5,6,7])
     or cardinality(p_days) <> (select count(distinct x) from unnest(p_days) x) then
    perform public.raise_contract_error('VALIDATION', 'days');
  end if;
  if p_start is null or p_end is null or p_start not between 0 and 1439 or p_end not between 1 and 1440
     or p_end <= p_start then
    perform public.raise_contract_error('VALIDATION', 'window_range');
  end if;
  if p_rate_minor is null or p_rate_minor < 0 or p_rate_minor > 100000000 then
    perform public.raise_contract_error('VALIDATION', 'rate');
  end if;
  if p_scope = 'device' and not exists (select 1 from public.devices where id = p_device_id and hall_id = p_hall_id) then
    perform public.raise_contract_error('NOT_FOUND');
  end if;
  if p_scope = 'category' and v_cat is null then perform public.raise_contract_error('VALIDATION', 'category'); end if;
  if p_id is not null and not exists (select 1 from public.pricing_windows where id = p_id and hall_id = p_hall_id) then
    perform public.raise_contract_error('NOT_FOUND');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pricing_windows:' || p_hall_id::text, 0));
  -- Overlaps on one target are rejected, never merged silently.
  if exists (
    select 1 from public.pricing_windows w
     where w.hall_id = p_hall_id and w.scope = p_scope and (p_id is null or w.id <> p_id)
       and w.device_id is not distinct from (case when p_scope = 'device' then p_device_id end)
       and lower(w.category) is not distinct from lower(case when p_scope = 'category' then v_cat end)
       and w.days && p_days and p_start < w.end_minute and w.start_minute < p_end) then
    perform public.raise_contract_error('CONFLICT', 'window_overlap');
  end if;

  if p_id is null then
    insert into public.pricing_windows (hall_id, scope, device_id, category, days, start_minute, end_minute,
                                        rate_per_hour_minor, updated_by)
    values (p_hall_id, p_scope, case when p_scope = 'device' then p_device_id end,
            case when p_scope = 'category' then v_cat end, p_days, p_start, p_end, p_rate_minor, auth.uid())
    returning id into v_id;
  else
    update public.pricing_windows
       set days = p_days, start_minute = p_start, end_minute = p_end, rate_per_hour_minor = p_rate_minor,
           updated_by = auth.uid(), updated_at = now()
     where id = p_id;
    v_id := p_id;
  end if;
  perform public.write_audit(p_hall_id, 'pricing.window.set', 'pricing_window', v_id::text, null, null,
    jsonb_build_object('scope', p_scope, 'days', p_days, 'start', p_start, 'end', p_end, 'rate_per_hour_minor', p_rate_minor));
  return v_id;
end $$;

create function public.delete_pricing_window(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_w public.pricing_windows;
begin
  select * into v_w from public.pricing_windows where id = p_id for update;
  if not found or not public.has_hall_permission(v_w.hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  delete from public.pricing_windows where id = p_id;
  perform public.write_audit(v_w.hall_id, 'pricing.window.delete', 'pricing_window', p_id::text, null,
    jsonb_build_object('days', v_w.days, 'start', v_w.start_minute, 'end', v_w.end_minute,
                       'rate_per_hour_minor', v_w.rate_per_hour_minor), null);
end $$;

-- ---------------------------------------------------------------------------
-- Package RPCs
-- ---------------------------------------------------------------------------

create function public.list_packages(p_hall_id uuid)
returns table (id uuid, name text, duration_minutes int, price_minor bigint, device_id uuid, device_name text,
               category text, from_minute int, to_minute int, valid_from timestamptz, valid_until timestamptz,
               max_uses int, uses bigint, active boolean, currency char(3))
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (public.has_hall_permission(p_hall_id, 'package.manage') or public.has_hall_permission(p_hall_id, 'session.start')) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select p.id, p.name, p.duration_minutes, p.price_minor, p.device_id, d.name, p.category, p.from_minute, p.to_minute,
           p.valid_from, p.valid_until, p.max_uses,
           (select count(*) from public.package_uses u where u.package_id = p.id), p.active, h.currency
      from public.packages p
      join public.halls h on h.id = p.hall_id
      left join public.devices d on d.id = p.device_id
     where p.hall_id = p_hall_id
     order by p.active desc, p.name;
end $$;

create function public.upsert_package(
  p_hall_id uuid, p_id uuid, p_name text, p_duration int, p_price_minor bigint, p_device_id uuid, p_category text,
  p_from_minute int, p_to_minute int, p_valid_from timestamptz, p_valid_until timestamptz, p_max_uses int,
  p_active boolean
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, '')); v_cat text := nullif(btrim(p_category), '');
begin
  if not public.has_hall_permission(p_hall_id, 'package.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if length(v_name) < 1 or length(v_name) > 60 then perform public.raise_contract_error('VALIDATION', 'name'); end if;
  if p_duration is null or p_duration not between 5 and 720 then perform public.raise_contract_error('VALIDATION', 'duration'); end if;
  if p_price_minor is null or p_price_minor < 0 or p_price_minor > 100000000 then
    perform public.raise_contract_error('VALIDATION', 'price');
  end if;
  if p_device_id is not null and v_cat is not null then perform public.raise_contract_error('VALIDATION', 'package_target'); end if;
  if p_device_id is not null and not exists (select 1 from public.devices where id = p_device_id and hall_id = p_hall_id) then
    perform public.raise_contract_error('NOT_FOUND');
  end if;
  if (p_from_minute is null) <> (p_to_minute is null)
     or (p_from_minute is not null and (p_from_minute not between 0 and 1439 or p_to_minute not between 1 and 1440
                                         or p_to_minute <= p_from_minute)) then
    perform public.raise_contract_error('VALIDATION', 'window_range');
  end if;
  if p_valid_from is not null and p_valid_until is not null and p_valid_until <= p_valid_from then
    perform public.raise_contract_error('VALIDATION', 'validity');
  end if;
  if p_max_uses is not null and p_max_uses < 1 then perform public.raise_contract_error('VALIDATION', 'max_uses'); end if;

  begin
    if p_id is null then
      insert into public.packages (hall_id, name, duration_minutes, price_minor, device_id, category, from_minute,
                                   to_minute, valid_from, valid_until, max_uses, active)
      values (p_hall_id, v_name, p_duration, p_price_minor, p_device_id, v_cat, p_from_minute, p_to_minute,
              p_valid_from, p_valid_until, p_max_uses, coalesce(p_active, true))
      returning id into v_id;
      perform public.write_audit(p_hall_id, 'package.create', 'package', v_id::text, null, null,
        jsonb_build_object('name', v_name, 'duration_minutes', p_duration, 'price_minor', p_price_minor));
    else
      update public.packages
         set name = v_name, duration_minutes = p_duration, price_minor = p_price_minor, device_id = p_device_id,
             category = v_cat, from_minute = p_from_minute, to_minute = p_to_minute, valid_from = p_valid_from,
             valid_until = p_valid_until, max_uses = p_max_uses, active = coalesce(p_active, active), updated_at = now()
       where id = p_id and hall_id = p_hall_id
       returning id into v_id;
      if v_id is null then perform public.raise_contract_error('NOT_FOUND'); end if;
      perform public.write_audit(p_hall_id, 'package.update', 'package', v_id::text, null, null,
        jsonb_build_object('name', v_name, 'duration_minutes', p_duration, 'price_minor', p_price_minor,
                           'active', coalesce(p_active, true)));
    end if;
  exception when unique_violation then
    perform public.raise_contract_error('CONFLICT', 'package_name_taken');
  end;
  return v_id;
end $$;

-- Starts a fixed session priced by a package. Same rules as a walk-in plus the package's eligibility.
create function public.start_package_session(
  p_hall_id uuid, p_package_id uuid, p_device_id uuid, p_customer_id uuid, p_guest_name text, p_key uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_p public.packages; v_dev public.devices; v_id uuid; v_tz text; v_local timestamp; v_min int; v_existing uuid;
begin
  if not public.has_hall_permission(p_hall_id, 'session.start') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;

  -- Retry-safe: a repeated key returns the session that the first call created.
  select s.id into v_existing from public.sessions s
    join public.package_uses u on u.session_id = s.id
   where s.started_by = auth.uid() and s.idempotency_key = p_key;
  if found then return v_existing; end if;

  select * into v_p from public.packages where id = p_package_id and hall_id = p_hall_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  select * into v_dev from public.devices where id = p_device_id and hall_id = p_hall_id;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;

  if not v_p.active then perform public.raise_contract_error('PRECONDITION_FAILED', 'package_inactive'); end if;
  if (v_p.valid_from is not null and now() < v_p.valid_from) or (v_p.valid_until is not null and now() >= v_p.valid_until) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'package_not_valid');
  end if;
  if v_p.device_id is not null and v_p.device_id <> p_device_id then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'package_device');
  end if;
  if v_p.category is not null and lower(v_p.category) is distinct from lower(v_dev.category) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'package_device');
  end if;
  if v_p.from_minute is not null then
    select time_zone into v_tz from public.halls where id = p_hall_id;
    v_local := now() at time zone v_tz;
    v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
    if v_min < v_p.from_minute or v_min >= v_p.to_minute then
      perform public.raise_contract_error('PRECONDITION_FAILED', 'package_time');
    end if;
  end if;
  if v_p.max_uses is not null and (select count(*) from public.package_uses where package_id = v_p.id) >= v_p.max_uses then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'package_exhausted');
  end if;

  v_id := public.start_walk_in(p_hall_id, p_device_id, 'fixed', v_p.duration_minutes, p_customer_id, p_guest_name, p_key);
  insert into public.package_uses (hall_id, package_id, session_id, name, duration_minutes, price_minor, created_by)
  values (p_hall_id, v_p.id, v_id, v_p.name, v_p.duration_minutes, v_p.price_minor, auth.uid());
  perform public.write_audit(p_hall_id, 'package.use', 'package', v_p.id::text, null, null,
    jsonb_build_object('session_id', v_id, 'device_id', p_device_id, 'price_minor', v_p.price_minor));
  return v_id;
end $$;

create function public.list_package_uses(p_package_id uuid)
returns table (id uuid, session_id uuid, device_name text, price_minor bigint, duration_minutes int,
               used_by_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_hall uuid;
begin
  select p.hall_id into v_hall from public.packages p where p.id = p_package_id;
  if v_hall is null or not public.has_hall_permission(v_hall, 'package.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select u.id, u.session_id, d.name, u.price_minor, u.duration_minutes, pr.display_name, u.created_at
      from public.package_uses u
      join public.sessions s on s.id = u.session_id
      join public.devices d on d.id = s.device_id
      left join public.profiles pr on pr.id = u.created_by
     where u.package_id = p_package_id
     order by u.created_at desc
     limit 100;
end $$;

-- ---------------------------------------------------------------------------
-- Discount RPCs
-- ---------------------------------------------------------------------------

create function public.list_discounts(p_hall_id uuid)
returns table (id uuid, name text, kind text, value bigint, valid_from timestamptz, valid_until timestamptz,
               max_uses int, uses bigint, active boolean, currency char(3))
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (public.has_hall_permission(p_hall_id, 'discount.manage') or public.has_hall_permission(p_hall_id, 'discount.apply')) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select d.id, d.name, d.kind, d.value, d.valid_from, d.valid_until, d.max_uses,
           (select count(*) from public.invoice_discounts x where x.discount_id = d.id), d.active, h.currency
      from public.discounts d join public.halls h on h.id = d.hall_id
     where d.hall_id = p_hall_id
     order by d.active desc, d.name;
end $$;

create function public.upsert_discount(
  p_hall_id uuid, p_id uuid, p_name text, p_kind text, p_value bigint,
  p_valid_from timestamptz, p_valid_until timestamptz, p_max_uses int, p_active boolean
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.has_hall_permission(p_hall_id, 'discount.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if length(v_name) < 1 or length(v_name) > 60 then perform public.raise_contract_error('VALIDATION', 'name'); end if;
  if p_kind is null or p_kind not in ('amount', 'percent') then perform public.raise_contract_error('VALIDATION', 'kind'); end if;
  if p_value is null or p_value < 1 or (p_kind = 'percent' and p_value > 10000) or (p_kind = 'amount' and p_value > 100000000) then
    perform public.raise_contract_error('VALIDATION', 'value');
  end if;
  if p_valid_from is not null and p_valid_until is not null and p_valid_until <= p_valid_from then
    perform public.raise_contract_error('VALIDATION', 'validity');
  end if;
  if p_max_uses is not null and p_max_uses < 1 then perform public.raise_contract_error('VALIDATION', 'max_uses'); end if;

  begin
    if p_id is null then
      insert into public.discounts (hall_id, name, kind, value, valid_from, valid_until, max_uses, active)
      values (p_hall_id, v_name, p_kind, p_value, p_valid_from, p_valid_until, p_max_uses, coalesce(p_active, true))
      returning id into v_id;
      perform public.write_audit(p_hall_id, 'discount.create', 'discount', v_id::text, null, null,
        jsonb_build_object('name', v_name, 'kind', p_kind, 'value', p_value));
    else
      update public.discounts
         set name = v_name, kind = p_kind, value = p_value, valid_from = p_valid_from, valid_until = p_valid_until,
             max_uses = p_max_uses, active = coalesce(p_active, active), updated_at = now()
       where id = p_id and hall_id = p_hall_id
       returning id into v_id;
      if v_id is null then perform public.raise_contract_error('NOT_FOUND'); end if;
      perform public.write_audit(p_hall_id, 'discount.update', 'discount', v_id::text, null, null,
        jsonb_build_object('name', v_name, 'kind', p_kind, 'value', p_value, 'active', coalesce(p_active, true)));
    end if;
  exception when unique_violation then
    perform public.raise_contract_error('CONFLICT', 'discount_name_taken');
  end;
  return v_id;
end $$;

-- The server decides the amount from the discount definition; the client sends only the choice.
create function public.apply_discount(p_invoice_id uuid, p_discount_id uuid, p_reason text, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_i public.invoices; v_d public.discounts; v_m public.hall_memberships; v_existing public.invoice_discounts;
        v_id uuid; v_gross bigint; v_amount bigint; v_final bigint; v_reason text := btrim(coalesce(p_reason, ''));
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

  -- Owner is unlimited. Anyone else needs a configured limit and may not exceed it.
  select * into v_m from public.hall_memberships
   where hall_id = v_i.hall_id and user_id = auth.uid() and status = 'active';
  if v_m.role_key <> 'owner' and (v_m.discount_limit_minor is null or v_amount > v_m.discount_limit_minor) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'exceeds_discount_limit');
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

create function public.list_invoice_discounts(p_invoice_id uuid)
returns table (id uuid, name text, kind text, value bigint, original_minor bigint, amount_minor bigint,
               final_minor bigint, reason text, applied_by_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_hall uuid;
begin
  select i.hall_id into v_hall from public.invoices i where i.id = p_invoice_id;
  if v_hall is null or not public.has_hall_permission(v_hall, 'invoice.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select x.id, x.name, x.kind, x.value, x.original_minor, x.amount_minor, x.final_minor, x.reason, pr.display_name, x.created_at
      from public.invoice_discounts x left join public.profiles pr on pr.id = x.applied_by
     where x.invoice_id = p_invoice_id
     order by x.created_at;
end $$;

-- ---------------------------------------------------------------------------
-- Grants: client RPCs for authenticated only; internal helpers have no client grants
-- ---------------------------------------------------------------------------

revoke execute on function
  public.list_pricing_windows(uuid),
  public.upsert_pricing_window(uuid, uuid, text, uuid, text, int[], int, int, bigint),
  public.delete_pricing_window(uuid),
  public.list_packages(uuid),
  public.upsert_package(uuid, uuid, text, int, bigint, uuid, text, int, int, timestamptz, timestamptz, int, boolean),
  public.start_package_session(uuid, uuid, uuid, uuid, text, uuid),
  public.list_package_uses(uuid),
  public.list_discounts(uuid),
  public.upsert_discount(uuid, uuid, text, text, bigint, timestamptz, timestamptz, int, boolean),
  public.apply_discount(uuid, uuid, text, uuid),
  public.list_invoice_discounts(uuid),
  public.resolve_device_windows(uuid),
  public.rate_at(timestamptz, bigint, jsonb, text),
  public.compute_segments(timestamptz, int, bigint, jsonb, text)
  from public, anon, authenticated;
grant execute on function
  public.list_pricing_windows(uuid),
  public.upsert_pricing_window(uuid, uuid, text, uuid, text, int[], int, int, bigint),
  public.delete_pricing_window(uuid),
  public.list_packages(uuid),
  public.upsert_package(uuid, uuid, text, int, bigint, uuid, text, int, int, timestamptz, timestamptz, int, boolean),
  public.start_package_session(uuid, uuid, uuid, uuid, text, uuid),
  public.list_package_uses(uuid),
  public.list_discounts(uuid),
  public.upsert_discount(uuid, uuid, text, text, bigint, timestamptz, timestamptz, int, boolean),
  public.apply_discount(uuid, uuid, text, uuid),
  public.list_invoice_discounts(uuid)
  to authenticated;
