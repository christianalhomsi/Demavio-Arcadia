-- Reservations and sessions (web phase W7; spec §8, §9, §16 inputs).
--
-- Scope notes (what this migration deliberately does NOT do):
--  * No pricing, invoices or payments. Those arrive in phase W8 (spec §10-11). Ending a session
--    records the actual billable duration and writes an 'invoice_pending' event; invoice
--    finalization will hook in there. A session is not an invoice (spec §1.3).
--  * No customer-facing creation. Customers book from the mobile app; staff-created reservations
--    use the same table and rules. Customer notifications and reminders are background jobs.
--  * Agent delivery is separate from session state: starting/ending a session queues an
--    agent_commands row when the device has an Agent, and never waits for it (spec §9.3).
--
-- Provisional rules pending business decisions (DEC-02/03/W06):
--  * Late check-in beyond the grace period needs the new reservation.override_late permission
--    plus a reason.
--  * Open sessions (walk-in or conversion) are only allowed when the device has no future
--    confirmed reservation (conservative; spec §9.4 / §15.3 "conservative until tested").
--  * If a hall has no working hours configured, the working-hours check is skipped.
--
-- Concurrency: every mutating function takes a row lock on the device first, so conflict checks
-- and writes for one device are serialized. Reservation overlap is additionally enforced by an
-- exclusion constraint, so it cannot be bypassed even by a bug in a function (spec §8.2).

-- Extensions live in their own schema so their (many) functions never appear in the public API.
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
-- The exclusion constraint below needs the extension's operator classes on the search path.
set local search_path = public, extensions;

-- New permission (provisional matrix: owner only).
insert into public.permissions (key, description)
values ('reservation.override_late', 'Check in a reservation after the grace period');
insert into public.role_permissions (role_key, permission_key) values ('owner', 'reservation.override_late');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.reservations (
  id                   uuid primary key default gen_random_uuid(),
  hall_id              uuid not null,
  device_id            uuid not null,
  customer_id          uuid references public.profiles (id),
  guest_name           text check (guest_name is null or length(btrim(guest_name)) between 1 and 80),
  status               text not null default 'confirmed'
                         check (status in ('confirmed', 'checked_in', 'canceled', 'no_show')),
  start_at             timestamptz not null,
  end_at               timestamptz not null,
  created_by           uuid references public.profiles (id),
  idempotency_key      uuid,
  canceled_at          timestamptz,
  canceled_by          uuid references public.profiles (id),
  cancel_reason        text,
  checked_in_at        timestamptz,
  checked_in_by        uuid references public.profiles (id),
  late_override_reason text,
  created_at           timestamptz not null default now(),
  foreign key (device_id, hall_id) references public.devices (id, hall_id),
  check (end_at > start_at),
  check (customer_id is not null or guest_name is not null),
  -- A device cannot hold two live reservations that overlap in time.
  constraint reservations_no_overlap exclude using gist (
    device_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (status in ('confirmed', 'checked_in'))
);
create index reservations_hall_start_idx on public.reservations (hall_id, start_at);
create unique index reservations_idem_idx on public.reservations (created_by, idempotency_key)
  where idempotency_key is not null;

create table public.reservation_events (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references public.reservations (id) on delete cascade,
  hall_id         uuid not null references public.halls (id),
  event_type      text not null,
  actor_id        uuid references public.profiles (id),
  detail          jsonb,
  created_at      timestamptz not null default now()
);
create index reservation_events_res_idx on public.reservation_events (reservation_id, created_at);

create table public.sessions (
  id                uuid primary key default gen_random_uuid(),
  hall_id           uuid not null,
  device_id         uuid not null,
  reservation_id    uuid references public.reservations (id),
  customer_id       uuid references public.profiles (id),
  guest_name        text check (guest_name is null or length(btrim(guest_name)) between 1 and 80),
  session_type      text not null check (session_type in ('fixed', 'open')),
  status            text not null default 'in_progress'
                      check (status in ('starting', 'in_progress', 'ending', 'completed', 'interrupted', 'canceled')),
  started_at        timestamptz not null default now(),
  scheduled_end_at  timestamptz,
  ended_at          timestamptz,
  end_type          text check (end_type in ('normal', 'interrupted', 'administrative')),
  billable_seconds  integer check (billable_seconds is null or billable_seconds >= 0),
  extension_count   integer not null default 0,
  converted_to_open boolean not null default false,
  started_by        uuid references public.profiles (id),
  ended_by          uuid references public.profiles (id),
  idempotency_key   uuid,
  created_at        timestamptz not null default now(),
  foreign key (device_id, hall_id) references public.devices (id, hall_id),
  check ((session_type = 'fixed') = (scheduled_end_at is not null)),
  check (scheduled_end_at is null or scheduled_end_at > started_at),
  check ((ended_at is null) = (end_type is null)),
  check (status in ('completed', 'interrupted', 'canceled') or ended_at is null)
);
-- A device runs at most one live session.
create unique index sessions_one_active_per_device_idx on public.sessions (device_id)
  where status in ('starting', 'in_progress', 'ending');
create unique index sessions_one_per_reservation_idx on public.sessions (reservation_id)
  where reservation_id is not null;
create unique index sessions_idem_idx on public.sessions (started_by, idempotency_key)
  where idempotency_key is not null;
create index sessions_hall_started_idx on public.sessions (hall_id, started_at desc);

create table public.session_events (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.sessions (id) on delete cascade,
  hall_id          uuid not null references public.halls (id),
  event_type       text not null,
  actor_id         uuid references public.profiles (id),
  reason           text,
  detail           jsonb,
  idempotency_key  uuid,
  created_at       timestamptz not null default now()
);
create index session_events_session_idx on public.session_events (session_id, created_at);
create unique index session_events_idem_idx on public.session_events (session_id, idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- RLS (read-only for clients) and realtime
-- ---------------------------------------------------------------------------

alter table public.reservations       enable row level security;
alter table public.reservation_events enable row level security;
alter table public.sessions           enable row level security;
alter table public.session_events     enable row level security;

create policy reservations_select on public.reservations
  for select to authenticated using (public.has_hall_permission(hall_id, 'reservation.view'));
create policy reservation_events_select on public.reservation_events
  for select to authenticated using (public.has_hall_permission(hall_id, 'reservation.view'));
create policy sessions_select on public.sessions
  for select to authenticated using (public.has_hall_permission(hall_id, 'session.start'));
create policy session_events_select on public.session_events
  for select to authenticated using (public.has_hall_permission(hall_id, 'session.start'));

grant select on public.reservations, public.reservation_events, public.sessions, public.session_events
  to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.reservations, public.sessions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- True if [p_start, p_end] lies inside one continuous opening range in the hall's time zone.
create function public.within_working_hours(p_hall uuid, p_start timestamptz, p_end timestamptz) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_tz text; v_ls timestamp; v_le timestamp;
begin
  if not exists (select 1 from public.hall_working_hours where hall_id = p_hall) then
    return true; -- hours not configured yet
  end if;
  select time_zone into v_tz from public.halls where id = p_hall;
  v_ls := p_start at time zone v_tz;
  v_le := p_end at time zone v_tz;
  return exists (
    select 1
      from generate_series((v_ls::date - 1)::timestamp, v_ls::date::timestamp, interval '1 day') d(day)
      join public.hall_working_hours h
        on h.hall_id = p_hall and h.weekday = extract(dow from d.day)::int
     where (d.day::date + h.opens) <= v_ls
       and v_le <= (d.day::date + h.closes) + case when h.closes <= h.opens then interval '1 day' else interval '0' end
  );
end $$;

-- Why a device cannot be used for [p_from, p_to) (p_to null = open-ended); null when it is free.
create function public.device_blocking_reason(
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
              where r.device_id = p_device and r.status = 'confirmed'
                and (p_ignore_reservation is null or r.id <> p_ignore_reservation)
                and r.start_at < v_to and r.end_at > p_from) then
    return 'reservation_conflict';
  end if;
  return null;
end $$;

create function public.queue_agent_command(p_device uuid, p_type text, p_session uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_hall uuid; v_id uuid;
begin
  -- Only devices with an Agent get commands; the session itself never depends on delivery.
  select d.hall_id into v_hall from public.devices d
   where d.id = p_device and exists (select 1 from public.agents a where a.device_id = d.id);
  if v_hall is null then return; end if;
  insert into public.agent_commands (hall_id, device_id, session_id, command_type, requested_by)
  values (v_hall, p_device, p_session, p_type, auth.uid()) returning id into v_id;
  insert into public.agent_command_events (command_id, hall_id, status) values (v_id, v_hall, 'Queued');
end $$;

create function public.lock_device(p_device uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  select 1 from public.devices where id = p_device for update;
$$;

-- ---------------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------------

create function public.create_reservation(
  p_hall_id uuid, p_device_id uuid, p_customer_id uuid, p_guest_name text,
  p_start timestamptz, p_end timestamptz, p_key uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_reason text; v_existing public.reservations;
begin
  if not public.has_hall_permission(p_hall_id, 'reservation.create') then
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
     or p_end - p_start < interval '5 minutes' or p_end - p_start > interval '24 hours' then
    perform public.raise_contract_error('VALIDATION', 'time_range');
  end if;
  if p_start < now() - interval '5 minutes' then
    perform public.raise_contract_error('VALIDATION', 'in_the_past');
  end if;
  if p_customer_id is null and (p_guest_name is null or length(btrim(p_guest_name)) = 0) then
    perform public.raise_contract_error('VALIDATION', 'customer');
  end if;
  -- The device must belong to the hall named in the request.
  if not exists (select 1 from public.devices where id = p_device_id and hall_id = p_hall_id) then
    perform public.raise_contract_error('NOT_FOUND');
  end if;

  perform public.lock_device(p_device_id);
  if not public.within_working_hours(p_hall_id, p_start, p_end) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'outside_working_hours');
  end if;
  v_reason := public.device_blocking_reason(p_device_id, p_start, p_end);
  if v_reason is not null then
    perform public.raise_contract_error(
      case when v_reason = 'device_disabled' then 'PRECONDITION_FAILED' else 'CONFLICT' end, v_reason);
  end if;

  begin
    insert into public.reservations (hall_id, device_id, customer_id, guest_name, start_at, end_at, created_by, idempotency_key)
    values (p_hall_id, p_device_id, p_customer_id, nullif(btrim(p_guest_name), ''), p_start, p_end, auth.uid(), p_key)
    returning id into v_id;
  exception when exclusion_violation then
    perform public.raise_contract_error('CONFLICT', 'reservation_conflict');
  end;

  insert into public.reservation_events (reservation_id, hall_id, event_type, actor_id, detail)
  values (v_id, p_hall_id, 'created', auth.uid(), jsonb_build_object('start', p_start, 'end', p_end));
  perform public.write_audit(p_hall_id, 'reservation.create', 'reservation', v_id::text, null, null,
    jsonb_build_object('device_id', p_device_id, 'start', p_start, 'end', p_end));
  return v_id;
end $$;

create function public.cancel_reservation(p_id uuid, p_reason text) returns void
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
  if v_r.status <> 'confirmed' then
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

-- Creates the session transactionally, records the staff member, and queues the Agent command.
create function public.check_in_reservation(p_id uuid, p_override_reason text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_r public.reservations; v_grace int; v_late boolean; v_session uuid; v_reason text;
begin
  select * into v_r from public.reservations where id = p_id for update;
  if not found or not public.has_hall_permission(v_r.hall_id, 'reservation.check_in') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  -- Retry-safe: a repeated request returns the existing session.
  if v_r.status = 'checked_in' then
    return (select id from public.sessions where reservation_id = p_id);
  end if;
  if v_r.status <> 'confirmed' then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'not_checkable');
  end if;
  if now() >= v_r.end_at then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'expired');
  end if;

  select checkin_grace_minutes into v_grace from public.hall_settings where hall_id = v_r.hall_id;
  v_late := now() > v_r.start_at + make_interval(mins => coalesce(v_grace, 0));
  if v_late then
    if not public.has_hall_permission(v_r.hall_id, 'reservation.override_late') then
      perform public.raise_contract_error('PERMISSION_DENIED', 'late_override');
    end if;
    if p_override_reason is null or length(btrim(p_override_reason)) = 0 then
      perform public.raise_contract_error('VALIDATION', 'override_reason');
    end if;
  end if;

  perform public.lock_device(v_r.device_id);
  v_reason := public.device_blocking_reason(v_r.device_id, now(), v_r.end_at, p_id, null);
  if v_reason is not null then
    perform public.raise_contract_error(
      case when v_reason in ('device_disabled', 'maintenance') then 'PRECONDITION_FAILED' else 'CONFLICT' end, v_reason);
  end if;

  insert into public.sessions (hall_id, device_id, reservation_id, customer_id, guest_name, session_type,
                               scheduled_end_at, started_by)
  values (v_r.hall_id, v_r.device_id, p_id, v_r.customer_id, v_r.guest_name, 'fixed', v_r.end_at, auth.uid())
  returning id into v_session;

  update public.reservations
     set status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid(),
         late_override_reason = case when v_late then btrim(p_override_reason) end
   where id = p_id;

  insert into public.reservation_events (reservation_id, hall_id, event_type, actor_id, detail)
  values (p_id, v_r.hall_id, 'checked_in', auth.uid(), jsonb_build_object('late', v_late, 'session_id', v_session));
  insert into public.session_events (session_id, hall_id, event_type, actor_id, detail)
  values (v_session, v_r.hall_id, 'started', auth.uid(), jsonb_build_object('source', 'reservation', 'reservation_id', p_id));
  perform public.queue_agent_command(v_r.device_id, 'START_SESSION', v_session);
  perform public.write_audit(v_r.hall_id, 'reservation.check_in', 'reservation', p_id::text,
    case when v_late then btrim(p_override_reason) end, null,
    jsonb_build_object('session_id', v_session, 'late_override', v_late));
  return v_session;
end $$;

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------

create function public.start_walk_in(
  p_hall_id uuid, p_device_id uuid, p_type text, p_duration_minutes int,
  p_customer_id uuid, p_guest_name text, p_key uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_end timestamptz; v_reason text; v_existing public.sessions;
begin
  if not public.has_hall_permission(p_hall_id, 'session.start') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;

  select * into v_existing from public.sessions where started_by = auth.uid() and idempotency_key = p_key;
  if found then
    if v_existing.device_id <> p_device_id or v_existing.session_type <> p_type then
      perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch');
    end if;
    return v_existing.id;
  end if;

  if p_type not in ('fixed', 'open') then perform public.raise_contract_error('VALIDATION', 'session_type'); end if;
  if p_type = 'fixed' and (p_duration_minutes is null or p_duration_minutes not between 5 and 720) then
    perform public.raise_contract_error('VALIDATION', 'duration');
  end if;
  if p_customer_id is null and (p_guest_name is null or length(btrim(p_guest_name)) = 0) then
    perform public.raise_contract_error('VALIDATION', 'customer');
  end if;
  if not exists (select 1 from public.devices where id = p_device_id and hall_id = p_hall_id) then
    perform public.raise_contract_error('NOT_FOUND');
  end if;

  perform public.lock_device(p_device_id);
  v_end := case when p_type = 'fixed' then now() + make_interval(mins => p_duration_minutes) end;
  v_reason := public.device_blocking_reason(p_device_id, now(), v_end);
  -- Conservative rule for open sessions: no future confirmed reservation on the device.
  if v_reason is null and p_type = 'open' and exists (
       select 1 from public.reservations where device_id = p_device_id and status = 'confirmed' and end_at > now()) then
    v_reason := 'reservation_conflict';
  end if;
  if v_reason is not null then
    perform public.raise_contract_error(
      case when v_reason in ('device_disabled', 'maintenance') then 'PRECONDITION_FAILED' else 'CONFLICT' end, v_reason);
  end if;

  insert into public.sessions (hall_id, device_id, customer_id, guest_name, session_type, scheduled_end_at, started_by, idempotency_key)
  values (p_hall_id, p_device_id, p_customer_id, nullif(btrim(p_guest_name), ''), p_type, v_end, auth.uid(), p_key)
  returning id into v_id;

  insert into public.session_events (session_id, hall_id, event_type, actor_id, detail)
  values (v_id, p_hall_id, 'started', auth.uid(), jsonb_build_object('source', 'walk_in', 'type', p_type));
  perform public.queue_agent_command(p_device_id, 'START_SESSION', v_id);
  perform public.write_audit(p_hall_id, 'session.start', 'session', v_id::text, null, null,
    jsonb_build_object('device_id', p_device_id, 'type', p_type, 'duration_minutes', p_duration_minutes));
  return v_id;
end $$;

-- Ending records the real duration. It never creates a payment, and never marks anything paid.
-- Invoice finalization is added in phase W8 at the 'invoice_pending' event.
create function public.end_session(p_id uuid, p_end_type text, p_reason text) returns integer
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

  if v_s.ended_at is not null then -- retry-safe: same end type returns the original duration
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
  insert into public.session_events (session_id, hall_id, event_type, actor_id, detail)
  values (p_id, v_s.hall_id, 'invoice_pending', auth.uid(), jsonb_build_object('note', 'invoice finalization arrives in phase W8'));
  perform public.queue_agent_command(v_s.device_id, 'END_SESSION', p_id);
  perform public.write_audit(v_s.hall_id, 'session.end', 'session', p_id::text, nullif(btrim(p_reason), ''), null,
    jsonb_build_object('end_type', p_end_type, 'billable_seconds', v_seconds));
  return v_seconds;
end $$;

create function public.extend_session(p_id uuid, p_minutes int, p_reason text, p_key uuid) returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.sessions; v_base timestamptz; v_new timestamptz; v_reason text;
begin
  select * into v_s from public.sessions where id = p_id for update;
  if not found or not public.has_hall_permission(v_s.hall_id, 'session.extend') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
  if p_minutes is null or p_minutes not between 1 and 720 then
    perform public.raise_contract_error('VALIDATION', 'minutes');
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 300 then
    perform public.raise_contract_error('VALIDATION', 'reason');
  end if;

  -- Retry-safe: the same key never extends twice.
  if exists (select 1 from public.session_events where session_id = p_id and idempotency_key = p_key) then
    return v_s.scheduled_end_at;
  end if;
  if v_s.status <> 'in_progress' or v_s.session_type <> 'fixed' then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'not_extendable');
  end if;

  perform public.lock_device(v_s.device_id);
  v_base := greatest(v_s.scheduled_end_at, now());
  v_new := v_base + make_interval(mins => p_minutes);
  v_reason := public.device_blocking_reason(v_s.device_id, v_base, v_new, null, p_id);
  if v_reason is not null then
    perform public.raise_contract_error(
      case when v_reason in ('device_disabled', 'maintenance') then 'PRECONDITION_FAILED' else 'CONFLICT' end, v_reason);
  end if;

  update public.sessions set scheduled_end_at = v_new, extension_count = extension_count + 1 where id = p_id;
  insert into public.session_events (session_id, hall_id, event_type, actor_id, reason, detail, idempotency_key)
  values (p_id, v_s.hall_id, 'extended', auth.uid(), btrim(p_reason),
          jsonb_build_object('minutes', p_minutes, 'old_end', v_s.scheduled_end_at, 'new_end', v_new), p_key);
  perform public.queue_agent_command(v_s.device_id, 'SYNC_STATE', p_id);
  perform public.write_audit(v_s.hall_id, 'session.extend', 'session', p_id::text, btrim(p_reason),
    jsonb_build_object('scheduled_end_at', v_s.scheduled_end_at), jsonb_build_object('scheduled_end_at', v_new));
  return v_new;
end $$;

create function public.convert_session_to_open(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.sessions;
begin
  select * into v_s from public.sessions where id = p_id for update;
  if not found or not public.has_hall_permission(v_s.hall_id, 'session.extend') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    perform public.raise_contract_error('VALIDATION', 'reason');
  end if;
  if v_s.session_type = 'open' then return; end if; -- retry-safe
  if v_s.status <> 'in_progress' then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'not_extendable');
  end if;

  perform public.lock_device(v_s.device_id);
  if exists (select 1 from public.reservations
              where device_id = v_s.device_id and status = 'confirmed' and end_at > now()) then
    perform public.raise_contract_error('CONFLICT', 'reservation_conflict');
  end if;

  update public.sessions set session_type = 'open', scheduled_end_at = null, converted_to_open = true where id = p_id;
  insert into public.session_events (session_id, hall_id, event_type, actor_id, reason, detail)
  values (p_id, v_s.hall_id, 'converted_to_open', auth.uid(), btrim(p_reason),
          jsonb_build_object('old_end', v_s.scheduled_end_at));
  perform public.queue_agent_command(v_s.device_id, 'SYNC_STATE', p_id);
  perform public.write_audit(v_s.hall_id, 'session.convert_to_open', 'session', p_id::text, btrim(p_reason),
    jsonb_build_object('scheduled_end_at', v_s.scheduled_end_at), null);
end $$;

-- ---------------------------------------------------------------------------
-- Background-job entry point (callable by the job runner / service role only, never by clients).
-- Re-checks current state and is safe to run repeatedly (spec §22).
-- ---------------------------------------------------------------------------
create function public.expire_no_shows() returns integer
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
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Read APIs with display names (profiles are not directly readable by staff)
-- ---------------------------------------------------------------------------

create function public.list_reservations(
  p_hall_id uuid, p_from timestamptz, p_to timestamptz, p_status text default null
)
returns table (
  id uuid, device_id uuid, device_name text, customer_name text, status text,
  start_at timestamptz, end_at timestamptz, session_id uuid, cancel_reason text
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'reservation.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select r.id, r.device_id, d.name, coalesce(r.guest_name, p.display_name, p.email), r.status,
           r.start_at, r.end_at, s.id, r.cancel_reason
      from public.reservations r
      join public.devices d on d.id = r.device_id
      left join public.profiles p on p.id = r.customer_id
      left join public.sessions s on s.reservation_id = r.id
     where r.hall_id = p_hall_id and r.start_at < p_to and r.end_at > p_from
       and (p_status is null or r.status = p_status)
     order by r.start_at, d.name
     limit 500;
end $$;

create function public.list_sessions(
  p_hall_id uuid, p_active_only boolean default false, p_limit int default 25, p_offset int default 0,
  p_session_id uuid default null
)
returns table (
  id uuid, device_id uuid, device_name text, customer_name text, session_type text, status text,
  started_at timestamptz, scheduled_end_at timestamptz, ended_at timestamptz, end_type text,
  billable_seconds int, extension_count int, reservation_id uuid, total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'session.start') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select s.id, s.device_id, d.name, coalesce(s.guest_name, p.display_name, p.email), s.session_type, s.status,
           s.started_at, s.scheduled_end_at, s.ended_at, s.end_type, s.billable_seconds, s.extension_count,
           s.reservation_id, count(*) over ()
      from public.sessions s
      join public.devices d on d.id = s.device_id
      left join public.profiles p on p.id = s.customer_id
     where s.hall_id = p_hall_id
       and (p_session_id is null or s.id = p_session_id)
       and (not p_active_only or s.status in ('starting', 'in_progress', 'ending'))
     order by s.started_at desc, s.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- Current time from the database so browser timers can correct for clock skew (display only).
create function public.server_now() returns timestamptz
language sql stable as $$ select now() $$;

-- ---------------------------------------------------------------------------
-- Live status: add session / reservation dimensions (appended columns only).
-- ---------------------------------------------------------------------------
create or replace view public.v_device_live_status with (security_invoker = true) as
select
  d.id                       as device_id,
  d.hall_id,
  d.name,
  d.device_type,
  d.category,
  d.capabilities,
  d.status                   as operational_status,
  case when m.id is null then 'none' else 'in_maintenance' end as maintenance_status,
  m.id                       as maintenance_id,
  m.reason                   as maintenance_reason,
  m.expected_end             as maintenance_expected_end,
  a.id                       as agent_id,
  a.version                  as agent_version,
  a.last_heartbeat_at,
  a.sync_state               as agent_sync_state,
  a.last_error               as agent_last_error,
  case
    when a.id is null then 'none'
    when a.last_heartbeat_at is null
         or a.last_heartbeat_at < now() - make_interval(secs => hs.agent_offline_threshold_seconds) then 'offline'
    else 'online'
  end                        as agent_status,
  case
    when d.status = 'disabled' then 'disabled'
    when m.id is not null then 'maintenance'
    when s.id is not null then 'in_use'
    else 'available'
  end                        as effective_availability,
  s.id                       as current_session_id,
  s.session_type             as current_session_type,
  s.started_at               as current_session_started_at,
  s.scheduled_end_at         as current_session_ends_at,
  (select min(r.start_at) from public.reservations r
    where r.device_id = d.id and r.status = 'confirmed' and r.end_at > now()) as next_reservation_at
from public.devices d
join public.hall_settings hs on hs.hall_id = d.hall_id
left join public.device_maintenance m on m.device_id = d.id and m.ended_at is null
left join public.agents a on a.device_id = d.id
left join public.sessions s on s.device_id = d.id and s.status in ('starting', 'in_progress', 'ending');

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.within_working_hours(uuid, timestamptz, timestamptz),
  public.device_blocking_reason(uuid, timestamptz, timestamptz, uuid, uuid),
  public.queue_agent_command(uuid, text, uuid),
  public.lock_device(uuid),
  public.create_reservation(uuid, uuid, uuid, text, timestamptz, timestamptz, uuid),
  public.cancel_reservation(uuid, text),
  public.check_in_reservation(uuid, text),
  public.start_walk_in(uuid, uuid, text, int, uuid, text, uuid),
  public.end_session(uuid, text, text),
  public.extend_session(uuid, int, text, uuid),
  public.convert_session_to_open(uuid, text),
  public.expire_no_shows(),
  public.list_reservations(uuid, timestamptz, timestamptz, text),
  public.list_sessions(uuid, boolean, int, int, uuid),
  public.server_now()
  from public, anon, authenticated;

grant execute on function
  public.create_reservation(uuid, uuid, uuid, text, timestamptz, timestamptz, uuid),
  public.cancel_reservation(uuid, text),
  public.check_in_reservation(uuid, text),
  public.start_walk_in(uuid, uuid, text, int, uuid, text, uuid),
  public.end_session(uuid, text, text),
  public.extend_session(uuid, int, text, uuid),
  public.convert_session_to_open(uuid, text),
  public.list_reservations(uuid, timestamptz, timestamptz, text),
  public.list_sessions(uuid, boolean, int, int, uuid),
  public.server_now()
  to authenticated;
