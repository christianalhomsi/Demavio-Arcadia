-- Public browsing and player self-booking (web: anonymous home page + /book flow + "my bookings").
--
-- Until now `anon` could call nothing and customers were expected to book from the mobile app only.
-- The web now has a public home page where anyone can browse halls and devices and see availability,
-- and a signed-in player (no staff role needed) can request a reservation.
--
-- Exposure is deliberately minimal and read-only for anonymous callers:
--  * halls: id, name, time zone  (active halls of active tenants only)
--  * devices: id, name, type, category, player-count options  (active devices only)
--  * availability: bare busy time ranges, never who booked or why
--  * working hours of the hall and a read-only price estimate
-- No profile, customer, audit or other financial data is reachable without a session.
--
-- Decisions taken with the product owner (reference app review):
--  * A player's booking starts as `pending` and HOLDS the slot (the exclusion constraint covers it);
--    staff confirm or reject it. A pending request nobody answered before it starts is auto-canceled
--    by expire_no_shows(). Staff-created reservations are still confirmed immediately.
--  * Some devices (PlayStation, billiards...) are priced by number of players (2 or 4). That is
--    configured purely through pricing rules: a device or category that has rules with a
--    players_count needs the player to pick one of those counts. Every other device is flat priced.
--  * Players may cancel their own pending/confirmed booking until the hall's cancellation deadline.
--  * Provisional player limits: at most 4 hours per booking, at most 5 upcoming active bookings.
--
-- Known limit: walk-in start and convert-to-open only look at CONFIRMED reservations (unchanged), so a
-- pending request does not block them. confirm_reservation re-validates the slot, so a pending
-- request that a walk-in overtook cannot be confirmed (it is rejected instead).

set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Permission: confirm / reject player requests (employees and owners)
-- ---------------------------------------------------------------------------

insert into public.permissions (key, description)
values ('reservation.confirm', 'Confirm or reject reservation requests made by players');
insert into public.role_permissions (role_key, permission_key) values
  ('employee', 'reservation.confirm'),
  ('owner', 'reservation.confirm');

-- ---------------------------------------------------------------------------
-- Reservations: pending status and player count
-- ---------------------------------------------------------------------------

alter table public.reservations drop constraint reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('pending', 'confirmed', 'checked_in', 'canceled', 'no_show'));

alter table public.reservations add column players_count smallint check (players_count in (2, 4));

alter table public.reservations drop constraint reservations_no_overlap;
alter table public.reservations add constraint reservations_no_overlap exclude using gist (
  device_id with =,
  tstzrange(start_at, end_at) with &&
) where (status in ('pending', 'confirmed', 'checked_in'));

alter table public.sessions add column players_count smallint check (players_count in (2, 4));

-- A session started from a reservation inherits its player count (so pricing can use it).
create function public.sessions_inherit_players() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.players_count is null and new.reservation_id is not null then
    select r.players_count into new.players_count from public.reservations r where r.id = new.reservation_id;
  end if;
  return new;
end $$;

create trigger sessions_inherit_players
  before insert on public.sessions
  for each row execute function public.sessions_inherit_players();

-- ---------------------------------------------------------------------------
-- Pricing by number of players
-- ---------------------------------------------------------------------------

alter table public.pricing_rules
  add column players_count smallint check (players_count in (2, 4)),
  add constraint pricing_rules_players_scope check (players_count is null or scope in ('category', 'device'));

drop index public.pricing_rules_category_idx;
drop index public.pricing_rules_device_idx;
create unique index pricing_rules_category_idx
  on public.pricing_rules (hall_id, lower(category), coalesce(players_count, 0)) where scope = 'category';
create unique index pricing_rules_device_idx
  on public.pricing_rules (device_id, coalesce(players_count, 0)) where scope = 'device';

-- Rate that applies to a device for a player count. Precedence (unchanged): device > category > hall;
-- inside a scope a rule for the exact player count beats a rule that has no player count.
create function public.resolve_device_rate(p_device uuid, p_players int)
returns table (rate_per_hour_minor bigint, rate_source text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_dev public.devices; v_rate bigint;
begin
  select * into v_dev from public.devices where id = p_device;
  if not found then return; end if;

  select r.rate_per_hour_minor into v_rate from public.pricing_rules r
   where r.scope = 'device' and r.device_id = p_device and (r.players_count is null or r.players_count = p_players)
   order by (r.players_count is null) limit 1;
  if found then return query select v_rate, 'device'::text; return; end if;

  if v_dev.category is not null then
    select r.rate_per_hour_minor into v_rate from public.pricing_rules r
     where r.hall_id = v_dev.hall_id and r.scope = 'category' and lower(r.category) = lower(v_dev.category)
       and (r.players_count is null or r.players_count = p_players)
     order by (r.players_count is null) limit 1;
    if found then return query select v_rate, 'category'::text; return; end if;
  end if;

  select r.rate_per_hour_minor into v_rate from public.pricing_rules r
   where r.hall_id = v_dev.hall_id and r.scope = 'hall';
  if found then return query select v_rate, 'hall'::text; return; end if;
  return query select 0::bigint, 'none'::text;
end $$;

-- Player counts a device can be booked with; empty = flat priced (no choice). Device-level rules win.
create function public.device_players_options(p_device uuid) returns int[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_dev public.devices; v_opts int[];
begin
  select * into v_dev from public.devices where id = p_device;
  if not found then return '{}'; end if;
  select array_agg(distinct r.players_count::int order by r.players_count::int) into v_opts
    from public.pricing_rules r
   where r.scope = 'device' and r.device_id = p_device and r.players_count is not null;
  if v_opts is null and v_dev.category is not null then
    select array_agg(distinct r.players_count::int order by r.players_count::int) into v_opts
      from public.pricing_rules r
     where r.hall_id = v_dev.hall_id and r.scope = 'category' and lower(r.category) = lower(v_dev.category)
       and r.players_count is not null;
  end if;
  return coalesce(v_opts, '{}');
end $$;

create or replace function public.capture_session_pricing() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rate bigint; v_source text; v_s public.hall_settings; v_cur char(3);
begin
  select * into v_s from public.hall_settings where hall_id = new.hall_id;
  select currency into v_cur from public.halls where id = new.hall_id;
  select x.rate_per_hour_minor, x.rate_source into v_rate, v_source
    from public.resolve_device_rate(new.device_id, new.players_count) x;

  insert into public.session_pricing_snapshots
    (session_id, hall_id, currency, rate_per_hour_minor, rate_source, increment_minutes, min_billable_minutes)
  values (new.id, new.hall_id, v_cur, coalesce(v_rate, 0), coalesce(v_source, 'none'),
          v_s.billing_increment_minutes, v_s.min_billable_minutes);
  return new;
end $$;

-- Same function with an optional player count (players-priced devices/categories).
drop function public.set_pricing_rate(uuid, text, uuid, text, bigint);
create function public.set_pricing_rate(
  p_hall_id uuid, p_scope text, p_device_id uuid, p_category text, p_rate_minor bigint,
  p_players_count int default null
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
  if p_players_count is not null and (p_players_count not in (2, 4) or p_scope = 'hall') then
    perform public.raise_contract_error('VALIDATION', 'players');
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
     and coalesce(players_count, 0) = coalesce(p_players_count, 0)
   for update;

  if v_id is null then
    insert into public.pricing_rules (hall_id, scope, device_id, category, rate_per_hour_minor, players_count, updated_by)
    values (p_hall_id, p_scope,
            case when p_scope = 'device' then p_device_id end,
            case when p_scope = 'category' then v_cat end,
            p_rate_minor, p_players_count, auth.uid())
    returning id into v_id;
  else
    update public.pricing_rules set rate_per_hour_minor = p_rate_minor, updated_by = auth.uid(), updated_at = now() where id = v_id;
  end if;

  -- Existing sessions keep their snapshot; this only affects sessions that start from now on.
  perform public.write_audit(p_hall_id, 'pricing.rate.set', 'pricing_rule', v_id::text, null,
    jsonb_build_object('rate_per_hour_minor', v_before),
    jsonb_build_object('scope', p_scope, 'device_id', p_device_id, 'category', v_cat,
                       'players_count', p_players_count, 'rate_per_hour_minor', p_rate_minor));
  return v_id;
end $$;

drop function public.list_pricing(uuid);
create function public.list_pricing(p_hall_id uuid)
returns table (id uuid, scope text, device_id uuid, device_name text, category text, rate_per_hour_minor bigint,
               currency char(3), increment_minutes int, min_billable_minutes int, players_count smallint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select r.id, r.scope, r.device_id, d.name, r.category, r.rate_per_hour_minor, h.currency,
           hs.billing_increment_minutes, hs.min_billable_minutes, r.players_count
      from public.pricing_rules r
      join public.halls h on h.id = r.hall_id
      join public.hall_settings hs on hs.hall_id = r.hall_id
      left join public.devices d on d.id = r.device_id
     where r.hall_id = p_hall_id
     order by case r.scope when 'hall' then 0 when 'category' then 1 else 2 end, r.category, d.name, r.players_count nulls first;
end $$;

-- ---------------------------------------------------------------------------
-- Reservation rules now that `pending` exists
-- ---------------------------------------------------------------------------

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
                and (s.scheduled_end_at is null or s.scheduled_end_at > p_from)
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

create or replace function public.cancel_reservation(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservations; v_deadline int; v_past boolean;
begin
  select * into v_r from public.reservations where id = p_id for update;
  if not found or not public.has_hall_permission(v_r.hall_id, 'reservation.cancel') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 300 then
    perform public.raise_contract_error('VALIDATION', 'reason');
  end if;
  if v_r.status = 'canceled' then return; end if; -- retry-safe
  if v_r.status not in ('pending', 'confirmed') then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'not_cancelable');
  end if;

  select cancellation_deadline_minutes into v_deadline from public.hall_settings where hall_id = v_r.hall_id;
  v_past := now() > v_r.start_at - make_interval(mins => coalesce(v_deadline, 0));

  update public.reservations
     set status = 'canceled', canceled_at = now(), canceled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = p_id;
  insert into public.reservation_events (reservation_id, hall_id, event_type, actor_id, detail)
  values (p_id, v_r.hall_id, 'canceled', auth.uid(), jsonb_build_object('reason', btrim(p_reason), 'past_deadline', v_past));
  perform public.write_audit(v_r.hall_id, 'reservation.cancel', 'reservation', p_id::text, btrim(p_reason), null,
    jsonb_build_object('past_deadline', v_past));
end $$;

-- Staff decision on a player's request.
create function public.confirm_reservation(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservations; v_reason text;
begin
  select * into v_r from public.reservations where id = p_id for update;
  if not found or not public.has_hall_permission(v_r.hall_id, 'reservation.confirm') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_r.status = 'confirmed' then return; end if; -- retry-safe
  if v_r.status <> 'pending' then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'not_pending');
  end if;
  if now() >= v_r.end_at then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'expired');
  end if;

  perform public.lock_device(v_r.device_id);
  v_reason := public.device_blocking_reason(v_r.device_id, v_r.start_at, v_r.end_at, p_id, null);
  if v_reason is not null then
    perform public.raise_contract_error(
      case when v_reason in ('device_disabled', 'maintenance') then 'PRECONDITION_FAILED' else 'CONFLICT' end, v_reason);
  end if;

  update public.reservations set status = 'confirmed' where id = p_id;
  insert into public.reservation_events (reservation_id, hall_id, event_type, actor_id)
  values (p_id, v_r.hall_id, 'confirmed', auth.uid());
  perform public.write_audit(v_r.hall_id, 'reservation.confirm', 'reservation', p_id::text, null, null, null);
end $$;

create function public.reject_reservation(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservations;
begin
  select * into v_r from public.reservations where id = p_id for update;
  if not found or not public.has_hall_permission(v_r.hall_id, 'reservation.confirm') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 300 then
    perform public.raise_contract_error('VALIDATION', 'reason');
  end if;
  if v_r.status = 'canceled' then return; end if; -- retry-safe
  if v_r.status <> 'pending' then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'not_pending');
  end if;

  update public.reservations
     set status = 'canceled', canceled_at = now(), canceled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = p_id;
  insert into public.reservation_events (reservation_id, hall_id, event_type, actor_id, detail)
  values (p_id, v_r.hall_id, 'rejected', auth.uid(), jsonb_build_object('reason', btrim(p_reason)));
  perform public.write_audit(v_r.hall_id, 'reservation.reject', 'reservation', p_id::text, btrim(p_reason), null, null);
end $$;

-- No-shows as before, plus pending requests that were never answered before their start time.
create or replace function public.expire_no_shows() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count int := 0; r record;
begin
  for r in
    select res.id, res.hall_id
      from public.reservations res
      join public.hall_settings hs on hs.hall_id = res.hall_id
     where res.status = 'confirmed'
       and now() > res.start_at + make_interval(mins => hs.checkin_grace_minutes)
     for update of res skip locked
  loop
    update public.reservations set status = 'no_show' where id = r.id and status = 'confirmed';
    if found then
      insert into public.reservation_events (reservation_id, hall_id, event_type, detail)
      values (r.id, r.hall_id, 'no_show', jsonb_build_object('reason', 'grace period elapsed'));
      v_count := v_count + 1;
    end if;
  end loop;

  for r in
    select res.id, res.hall_id from public.reservations res
     where res.status = 'pending' and now() >= res.start_at
     for update of res skip locked
  loop
    update public.reservations
       set status = 'canceled', canceled_at = now(), cancel_reason = 'not_confirmed'
     where id = r.id and status = 'pending';
    if found then
      insert into public.reservation_events (reservation_id, hall_id, event_type, detail)
      values (r.id, r.hall_id, 'expired', jsonb_build_object('reason', 'not confirmed before start'));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

drop function public.list_reservations(uuid, timestamptz, timestamptz, text);
create function public.list_reservations(
  p_hall_id uuid, p_from timestamptz, p_to timestamptz, p_status text default null
)
returns table (
  id uuid, device_id uuid, device_name text, customer_name text, status text,
  start_at timestamptz, end_at timestamptz, session_id uuid, cancel_reason text, players_count smallint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'reservation.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select r.id, r.device_id, d.name, coalesce(r.guest_name, p.display_name, p.email), r.status,
           r.start_at, r.end_at, s.id, r.cancel_reason, r.players_count
      from public.reservations r
      join public.devices d on d.id = r.device_id
      left join public.profiles p on p.id = r.customer_id
      left join public.sessions s on s.reservation_id = r.id
     where r.hall_id = p_hall_id and r.start_at < p_to and r.end_at > p_from
       and (p_status is null or r.status = p_status)
     order by r.start_at, d.name
     limit 500;
end $$;

-- ---------------------------------------------------------------------------
-- Public read API (anon + authenticated)
-- ---------------------------------------------------------------------------

create function public.list_public_halls()
returns table (id uuid, name text, time_zone text, device_count int)
language sql stable security definer set search_path = public, pg_temp as $$
  select h.id, h.name, h.time_zone,
         (select count(*)::int from public.devices d where d.hall_id = h.id and d.status = 'active')
    from public.halls h
    join public.tenants t on t.id = h.tenant_id
   where h.status = 'active' and t.status = 'active'
   order by h.name;
$$;

create function public.get_public_hall(p_hall_id uuid)
returns table (id uuid, name text, time_zone text, currency char(3), working_hours jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select h.id, h.name, h.time_zone, h.currency,
         coalesce((select jsonb_agg(jsonb_build_object('weekday', w.weekday, 'opens', w.opens, 'closes', w.closes)
                                    order by w.weekday, w.opens)
                     from public.hall_working_hours w where w.hall_id = h.id), '[]'::jsonb)
    from public.halls h
    join public.tenants t on t.id = h.tenant_id
   where h.id = p_hall_id and h.status = 'active' and t.status = 'active';
$$;

create function public.list_public_devices(p_hall_id uuid)
returns table (id uuid, name text, device_type text, category text, player_options int[])
language sql stable security definer set search_path = public, pg_temp as $$
  select d.id, d.name, d.device_type, d.category, public.device_players_options(d.id)
    from public.devices d
    join public.halls h on h.id = d.hall_id
    join public.tenants t on t.id = h.tenant_id
   where d.hall_id = p_hall_id and d.status = 'active'
     and h.status = 'active' and t.status = 'active'
   order by d.name;
$$;

-- Busy ranges of one device inside [p_from, p_to). Window is capped so this cannot be used to scrape.
create function public.list_public_device_busy(p_device_id uuid, p_from timestamptz, p_to timestamptz)
returns table (start_at timestamptz, end_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '8 days' then
    perform public.raise_contract_error('VALIDATION', 'period');
  end if;
  if not exists (
    select 1 from public.devices d
      join public.halls h on h.id = d.hall_id
      join public.tenants t on t.id = h.tenant_id
     where d.id = p_device_id and d.status = 'active' and h.status = 'active' and t.status = 'active'
  ) then
    perform public.raise_contract_error('NOT_FOUND');
  end if;

  return query
    select r.start_at, r.end_at
      from public.reservations r
     where r.device_id = p_device_id and r.status in ('pending', 'confirmed', 'checked_in')
       and r.start_at < p_to and r.end_at > p_from
    union all
    -- Live sessions block the device until their scheduled end (open sessions: for the whole window).
    select s.started_at, coalesce(s.scheduled_end_at, p_to)
      from public.sessions s
     where s.device_id = p_device_id and s.status in ('starting', 'in_progress', 'ending')
       and s.started_at < p_to and coalesce(s.scheduled_end_at, p_to) > p_from
    union all
    select m.started_at, coalesce(m.expected_end, p_to)
      from public.device_maintenance m
     where m.device_id = p_device_id and m.ended_at is null
       and m.started_at < p_to and coalesce(m.expected_end, p_to) > p_from
    order by 1;
end $$;

-- Read-only estimate shown before booking. The real charge is always computed from the session.
create function public.quote_public_price(p_device_id uuid, p_players int, p_start timestamptz, p_end timestamptz)
returns table (currency char(3), rate_per_hour_minor bigint, estimated_minor bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_hall uuid; v_cur char(3); v_opts int[]; v_rate bigint; v_s public.hall_settings; v_amount bigint;
begin
  if p_start is null or p_end is null or p_end <= p_start or p_end - p_start > interval '24 hours' then
    perform public.raise_contract_error('VALIDATION', 'time_range');
  end if;
  select d.hall_id, h.currency into v_hall, v_cur
    from public.devices d
    join public.halls h on h.id = d.hall_id
    join public.tenants t on t.id = h.tenant_id
   where d.id = p_device_id and d.status = 'active' and h.status = 'active' and t.status = 'active';
  if v_hall is null then perform public.raise_contract_error('NOT_FOUND'); end if;

  v_opts := public.device_players_options(p_device_id);
  if cardinality(v_opts) > 0 and (p_players is null or not (p_players = any (v_opts))) then
    perform public.raise_contract_error('VALIDATION', 'players');
  end if;

  select x.rate_per_hour_minor into v_rate
    from public.resolve_device_rate(p_device_id, case when cardinality(v_opts) > 0 then p_players end) x;
  select * into v_s from public.hall_settings where hall_id = v_hall;
  select c.amount_minor into v_amount
    from public.compute_session_charge(coalesce(v_rate, 0), extract(epoch from (p_end - p_start))::int,
                                       v_s.billing_increment_minutes, v_s.min_billable_minutes) c;
  return query select v_cur, coalesce(v_rate, 0), coalesce(v_amount, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Player booking API (authenticated)
-- ---------------------------------------------------------------------------

create function public.create_player_reservation(
  p_device_id uuid, p_start timestamptz, p_end timestamptz, p_key uuid, p_players int default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_hall uuid; v_id uuid; v_reason text; v_existing public.reservations; v_opts int[];
begin
  if auth.uid() is null then perform public.raise_contract_error('PERMISSION_DENIED'); end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and status = 'active') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;

  select * into v_existing from public.reservations where created_by = auth.uid() and idempotency_key = p_key;
  if found then
    if v_existing.device_id <> p_device_id or v_existing.start_at <> p_start or v_existing.end_at <> p_end then
      perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch');
    end if;
    return v_existing.id;
  end if;

  if p_start is null or p_end is null or p_end <= p_start
     or p_end - p_start < interval '5 minutes' or p_end - p_start > interval '4 hours' then
    perform public.raise_contract_error('VALIDATION', 'time_range');
  end if;
  if p_start < now() - interval '5 minutes' then
    perform public.raise_contract_error('VALIDATION', 'in_the_past');
  end if;

  select d.hall_id into v_hall
    from public.devices d
    join public.halls h on h.id = d.hall_id
    join public.tenants t on t.id = h.tenant_id
   where d.id = p_device_id and d.status = 'active' and h.status = 'active' and t.status = 'active';
  if v_hall is null then perform public.raise_contract_error('NOT_FOUND'); end if;

  -- Players-priced devices need one of their configured counts; flat devices ignore the field.
  v_opts := public.device_players_options(p_device_id);
  if cardinality(v_opts) > 0 then
    if p_players is null or not (p_players = any (v_opts)) then
      perform public.raise_contract_error('VALIDATION', 'players');
    end if;
  else
    p_players := null;
  end if;

  if (select count(*) from public.reservations
       where customer_id = auth.uid() and status in ('pending', 'confirmed') and end_at > now()) >= 5 then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'too_many');
  end if;

  perform public.lock_device(p_device_id);
  if not public.within_working_hours(v_hall, p_start, p_end) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'outside_working_hours');
  end if;
  v_reason := public.device_blocking_reason(p_device_id, p_start, p_end);
  if v_reason is not null then
    perform public.raise_contract_error(
      case when v_reason = 'device_disabled' then 'PRECONDITION_FAILED' else 'CONFLICT' end, v_reason);
  end if;

  begin
    insert into public.reservations (hall_id, device_id, customer_id, status, players_count, start_at, end_at,
                                     created_by, idempotency_key)
    values (v_hall, p_device_id, auth.uid(), 'pending', p_players::smallint, p_start, p_end, auth.uid(), p_key)
    returning id into v_id;
  exception when exclusion_violation then
    perform public.raise_contract_error('CONFLICT', 'reservation_conflict');
  end;

  insert into public.reservation_events (reservation_id, hall_id, event_type, actor_id, detail)
  values (v_id, v_hall, 'created', auth.uid(),
          jsonb_build_object('start', p_start, 'end', p_end, 'source', 'player', 'players', p_players));
  perform public.write_audit(v_hall, 'reservation.create', 'reservation', v_id::text, null, null,
    jsonb_build_object('device_id', p_device_id, 'start', p_start, 'end', p_end, 'source', 'player'));
  return v_id;
end $$;

create function public.list_my_reservations()
returns table (
  id uuid, hall_name text, time_zone text, device_name text, start_at timestamptz, end_at timestamptz,
  status text, players_count smallint, cancel_reason text, can_cancel boolean
)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.id, h.name, h.time_zone, d.name, r.start_at, r.end_at, r.status, r.players_count, r.cancel_reason,
         (r.status in ('pending', 'confirmed')
          and now() <= r.start_at - make_interval(mins => coalesce(hs.cancellation_deadline_minutes, 0)))
    from public.reservations r
    join public.devices d on d.id = r.device_id
    join public.halls h on h.id = r.hall_id
    left join public.hall_settings hs on hs.hall_id = r.hall_id
   where r.customer_id = auth.uid()
   order by r.start_at desc
   limit 200;
$$;

create function public.cancel_my_reservation(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservations; v_deadline int;
begin
  if auth.uid() is null then perform public.raise_contract_error('PERMISSION_DENIED'); end if;
  select * into v_r from public.reservations where id = p_id and customer_id = auth.uid() for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if v_r.status = 'canceled' then return; end if; -- retry-safe
  if v_r.status not in ('pending', 'confirmed') then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'not_cancelable');
  end if;
  select cancellation_deadline_minutes into v_deadline from public.hall_settings where hall_id = v_r.hall_id;
  if now() > v_r.start_at - make_interval(mins => coalesce(v_deadline, 0)) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'past_deadline');
  end if;

  update public.reservations
     set status = 'canceled', canceled_at = now(), canceled_by = auth.uid(), cancel_reason = 'canceled_by_player'
   where id = p_id;
  insert into public.reservation_events (reservation_id, hall_id, event_type, actor_id, detail)
  values (p_id, v_r.hall_id, 'canceled', auth.uid(), jsonb_build_object('reason', 'canceled_by_player', 'source', 'player'));
  perform public.write_audit(v_r.hall_id, 'reservation.cancel', 'reservation', p_id::text, 'canceled_by_player', null,
    jsonb_build_object('source', 'player'));
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Helpers (resolve_device_rate, device_players_options, sessions_inherit_players) stay internal.
-- ---------------------------------------------------------------------------

revoke execute on function
  public.list_public_halls(), public.get_public_hall(uuid), public.list_public_devices(uuid),
  public.list_public_device_busy(uuid, timestamptz, timestamptz),
  public.quote_public_price(uuid, int, timestamptz, timestamptz),
  public.create_player_reservation(uuid, timestamptz, timestamptz, uuid, int),
  public.list_my_reservations(), public.cancel_my_reservation(uuid),
  public.confirm_reservation(uuid), public.reject_reservation(uuid, text),
  public.list_reservations(uuid, timestamptz, timestamptz, text),
  public.set_pricing_rate(uuid, text, uuid, text, bigint, int), public.list_pricing(uuid),
  public.resolve_device_rate(uuid, int), public.device_players_options(uuid),
  public.sessions_inherit_players()
  from public, anon, authenticated;

grant execute on function
  public.list_public_halls(), public.get_public_hall(uuid), public.list_public_devices(uuid),
  public.list_public_device_busy(uuid, timestamptz, timestamptz),
  public.quote_public_price(uuid, int, timestamptz, timestamptz)
  to anon, authenticated;

grant execute on function
  public.create_player_reservation(uuid, timestamptz, timestamptz, uuid, int),
  public.list_my_reservations(), public.cancel_my_reservation(uuid),
  public.confirm_reservation(uuid), public.reject_reservation(uuid, text),
  public.list_reservations(uuid, timestamptz, timestamptz, text),
  public.set_pricing_rate(uuid, text, uuid, text, bigint, int), public.list_pricing(uuid)
  to authenticated;
