-- Devices, maintenance, Agent visibility and device commands (web phase W6; spec §7.2-7.4, §15, §17.1).
--
-- Scope notes:
--  * Reservations and sessions do not exist yet, so the live-status view reports operational,
--    maintenance and Agent-connectivity state only. Reservation/session dimensions are added by
--    the migrations that introduce those tables.
--  * Agent-facing operations (registration, heartbeat, acknowledgements) belong to the Agent
--    protocol and are NOT implemented here. This migration only stores what they will write and
--    lets staff request commands and read their state.
--  * START_SESSION / END_SESSION commands are issued by the session flows, not by this RPC.
--
-- Contract errors are raised through raise_contract_error (P0001, message = contract code).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

alter table public.hall_settings
  add column agent_offline_threshold_seconds int not null default 90
    check (agent_offline_threshold_seconds between 10 and 3600);

create table public.devices (
  id            uuid primary key default gen_random_uuid(),
  hall_id       uuid not null references public.halls (id),
  name          text not null check (length(btrim(name)) between 1 and 40),
  device_type   text not null check (device_type in ('pc', 'console')),
  category      text check (category is null or length(btrim(category)) between 1 and 40),
  capabilities  text[] not null default '{}'
                check (capabilities <@ array['lock', 'unlock', 'shutdown', 'restart']),
  status        text not null default 'active' check (status in ('active', 'disabled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index devices_hall_name_idx on public.devices (hall_id, lower(name));
-- Lets child tables prove they belong to the same hall as the device (tenant isolation by constraint).
create unique index devices_id_hall_idx on public.devices (id, hall_id);

create table public.device_maintenance (
  id             uuid primary key default gen_random_uuid(),
  hall_id        uuid not null,
  device_id      uuid not null,
  reason         text not null check (length(btrim(reason)) between 1 and 300),
  started_at     timestamptz not null default now(),
  expected_end   timestamptz,
  ended_at       timestamptz,
  started_by     uuid not null references public.profiles (id),
  ended_by       uuid references public.profiles (id),
  foreign key (device_id, hall_id) references public.devices (id, hall_id),
  check (expected_end is null or expected_end > started_at),
  check ((ended_at is null) = (ended_by is null))
);
-- A device is in maintenance at most once at a time.
create unique index device_maintenance_one_open_idx on public.device_maintenance (device_id) where ended_at is null;

-- One Agent per device. Rows are written by the Agent protocol (later), read by the web.
create table public.agents (
  id                        uuid primary key default gen_random_uuid(),
  hall_id                   uuid not null,
  device_id                 uuid not null unique,
  version                   text,
  last_heartbeat_at         timestamptz,
  last_success_command_at   timestamptz,
  last_error                text,
  sync_state                text not null default 'unknown' check (sync_state in ('unknown', 'synced', 'out_of_sync')),
  created_at                timestamptz not null default now(),
  foreign key (device_id, hall_id) references public.devices (id, hall_id)
);
create index agents_hall_idx on public.agents (hall_id);

create table public.agent_commands (
  id               uuid primary key default gen_random_uuid(),
  hall_id          uuid not null,
  device_id        uuid not null,
  session_id       uuid,
  command_type     text not null check (command_type in
                     ('START_SESSION', 'END_SESSION', 'LOCK', 'UNLOCK', 'SHUTDOWN', 'RESTART', 'SYNC_STATE')),
  status           text not null default 'Queued' check (status in
                     ('Queued', 'Sent', 'Acknowledged', 'Executed', 'Failed', 'TimedOut', 'Canceled')),
  requested_by     uuid references public.profiles (id),
  idempotency_key  uuid,
  response         jsonb,
  error_message    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (device_id, hall_id) references public.devices (id, hall_id)
);
create index agent_commands_hall_created_idx on public.agent_commands (hall_id, created_at desc);
create index agent_commands_device_idx on public.agent_commands (device_id, created_at desc);
-- A repeated request with the same key by the same user maps to the same command (spec §19.2).
create unique index agent_commands_idem_idx on public.agent_commands (requested_by, idempotency_key)
  where idempotency_key is not null;

create table public.agent_command_events (
  id          uuid primary key default gen_random_uuid(),
  command_id  uuid not null references public.agent_commands (id) on delete cascade,
  hall_id     uuid not null references public.halls (id),
  status      text not null,
  detail      text,
  created_at  timestamptz not null default now()
);
create index agent_command_events_command_idx on public.agent_command_events (command_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS: read access for members holding device.view; no direct client writes.
-- ---------------------------------------------------------------------------

alter table public.devices              enable row level security;
alter table public.device_maintenance   enable row level security;
alter table public.agents               enable row level security;
alter table public.agent_commands       enable row level security;
alter table public.agent_command_events enable row level security;

create policy devices_select on public.devices
  for select to authenticated using (public.has_hall_permission(hall_id, 'device.view'));
create policy device_maintenance_select on public.device_maintenance
  for select to authenticated using (public.has_hall_permission(hall_id, 'device.view'));
create policy agents_select on public.agents
  for select to authenticated using (public.has_hall_permission(hall_id, 'device.view'));
create policy agent_commands_select on public.agent_commands
  for select to authenticated using (public.has_hall_permission(hall_id, 'device.view'));
create policy agent_command_events_select on public.agent_command_events
  for select to authenticated using (public.has_hall_permission(hall_id, 'device.view'));

grant select on public.devices, public.device_maintenance, public.agents,
  public.agent_commands, public.agent_command_events to authenticated;

-- ---------------------------------------------------------------------------
-- Live status view. security_invoker => the caller's RLS applies to every joined table.
-- Effective availability is decided here, not in the browser (spec §7.3).
-- ---------------------------------------------------------------------------

create view public.v_device_live_status with (security_invoker = true) as
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
    else 'available'
  end                        as effective_availability
from public.devices d
join public.hall_settings hs on hs.hall_id = d.hall_id
left join public.device_maintenance m on m.device_id = d.id and m.ended_at is null
left join public.agents a on a.device_id = d.id;

grant select on public.v_device_live_status to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Create (p_device_id null) or update a device. Devices are disabled, never deleted (history stays).
create function public.upsert_device(
  p_hall_id uuid, p_device_id uuid, p_name text, p_type text, p_category text,
  p_capabilities text[], p_status text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_before jsonb; v_after jsonb;
begin
  if not public.has_hall_permission(p_hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 40 then
    perform public.raise_contract_error('VALIDATION', 'name');
  end if;
  if p_type not in ('pc', 'console') then
    perform public.raise_contract_error('VALIDATION', 'device_type');
  end if;
  if p_status not in ('active', 'disabled') then
    perform public.raise_contract_error('VALIDATION', 'status');
  end if;

  begin
    if p_device_id is null then
      insert into public.devices (hall_id, name, device_type, category, capabilities, status)
      values (p_hall_id, btrim(p_name), p_type, nullif(btrim(p_category), ''), coalesce(p_capabilities, '{}'), p_status)
      returning id into v_id;
      select to_jsonb(d) - 'created_at' - 'updated_at' into v_after from public.devices d where id = v_id;
      perform public.write_audit(p_hall_id, 'device.create', 'device', v_id::text, null, null, v_after);
    else
      -- The device must belong to the hall named in the request (no cross-hall edits).
      select to_jsonb(d) - 'created_at' - 'updated_at' into v_before
        from public.devices d where id = p_device_id and hall_id = p_hall_id for update;
      if v_before is null then
        perform public.raise_contract_error('NOT_FOUND');
      end if;
      update public.devices
         set name = btrim(p_name), device_type = p_type, category = nullif(btrim(p_category), ''),
             capabilities = coalesce(p_capabilities, '{}'), status = p_status, updated_at = now()
       where id = p_device_id;
      v_id := p_device_id;
      select to_jsonb(d) - 'created_at' - 'updated_at' into v_after from public.devices d where id = v_id;
      perform public.write_audit(p_hall_id, 'device.update', 'device', v_id::text, null, v_before, v_after);
    end if;
  exception
    when unique_violation then perform public.raise_contract_error('CONFLICT', 'name_taken');
    when check_violation then perform public.raise_contract_error('VALIDATION');
  end;
  return v_id;
end $$;

create function public.start_maintenance(p_device_id uuid, p_reason text, p_expected_end timestamptz) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_hall uuid; v_id uuid;
begin
  select hall_id into v_hall from public.devices where id = p_device_id;
  if v_hall is null or not public.has_hall_permission(v_hall, 'device.control') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 300 then
    perform public.raise_contract_error('VALIDATION', 'reason');
  end if;
  if p_expected_end is not null and p_expected_end <= now() then
    perform public.raise_contract_error('VALIDATION', 'expected_end');
  end if;
  begin
    insert into public.device_maintenance (hall_id, device_id, reason, expected_end, started_by)
    values (v_hall, p_device_id, btrim(p_reason), p_expected_end, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    perform public.raise_contract_error('CONFLICT', 'already_in_maintenance');
  end;
  perform public.write_audit(v_hall, 'device.maintenance.start', 'device', p_device_id::text, btrim(p_reason), null,
    jsonb_build_object('maintenance_id', v_id, 'expected_end', p_expected_end));
  return v_id;
end $$;

create function public.end_maintenance(p_maintenance_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m public.device_maintenance;
begin
  select * into v_m from public.device_maintenance where id = p_maintenance_id for update;
  if not found or not public.has_hall_permission(v_m.hall_id, 'device.control') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_m.ended_at is not null then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'already_ended');
  end if;
  update public.device_maintenance set ended_at = now(), ended_by = auth.uid() where id = v_m.id;
  perform public.write_audit(v_m.hall_id, 'device.maintenance.end', 'device', v_m.device_id::text, null,
    jsonb_build_object('maintenance_id', v_m.id), null);
end $$;

-- Staff-requested commands only. The payload is built server-side from the type: no free-form
-- command text and no shell access (spec §15.2). Recorded BEFORE any dispatch (spec §15.4).
create function public.request_device_command(p_device_id uuid, p_type text, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_dev public.devices; v_id uuid; v_existing public.agent_commands;
begin
  select * into v_dev from public.devices where id = p_device_id;
  if not found or not public.has_hall_permission(v_dev.hall_id, 'device.control') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_type not in ('LOCK', 'UNLOCK', 'SHUTDOWN', 'RESTART', 'SYNC_STATE') then
    perform public.raise_contract_error('VALIDATION', 'command_type');
  end if;
  if p_key is null then
    perform public.raise_contract_error('VALIDATION', 'idempotency_key');
  end if;

  -- Same user + same key: return the original command instead of creating another (spec §19.2).
  select * into v_existing from public.agent_commands where requested_by = auth.uid() and idempotency_key = p_key;
  if found then
    if v_existing.device_id <> p_device_id or v_existing.command_type <> p_type then
      perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch');
    end if;
    return v_existing.id;
  end if;

  if v_dev.status <> 'active' then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'device_disabled');
  end if;
  if not exists (select 1 from public.agents where device_id = p_device_id) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'no_agent');
  end if;
  if p_type <> 'SYNC_STATE' and not (lower(p_type) = any (v_dev.capabilities)) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'unsupported_command');
  end if;

  insert into public.agent_commands (hall_id, device_id, command_type, requested_by, idempotency_key)
  values (v_dev.hall_id, p_device_id, p_type, auth.uid(), p_key)
  returning id into v_id;
  insert into public.agent_command_events (command_id, hall_id, status) values (v_id, v_dev.hall_id, 'Queued');
  perform public.write_audit(v_dev.hall_id, 'device.command.request', 'agent_command', v_id::text, null, null,
    jsonb_build_object('device_id', p_device_id, 'type', p_type));
  return v_id;
end $$;

create function public.list_agent_commands(
  p_hall_id uuid, p_device_id uuid default null, p_status text default null, p_type text default null,
  p_limit int default 25, p_offset int default 0
)
returns table (
  id uuid, device_id uuid, device_name text, command_type text, status text, requested_by_name text,
  error_message text, created_at timestamptz, updated_at timestamptz, total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'device.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select c.id, c.device_id, d.name, c.command_type, c.status, coalesce(p.display_name, p.email),
           c.error_message, c.created_at, c.updated_at, count(*) over ()
      from public.agent_commands c
      join public.devices d on d.id = c.device_id
      left join public.profiles p on p.id = c.requested_by
     where c.hall_id = p_hall_id
       and (p_device_id is null or c.device_id = p_device_id)
       and (p_status is null or c.status = p_status)
       and (p_type is null or c.command_type = p_type)
     order by c.created_at desc, c.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Realtime: events are delivery hints only; clients refetch authorized state (spec §17.1).
-- The publication exists on Supabase; absent in plain Postgres test harnesses.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.devices, public.device_maintenance, public.agents, public.agent_commands;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges: expose only the client-facing API (see tests: "function exposure").
-- ---------------------------------------------------------------------------
revoke execute on function
  public.upsert_device(uuid, uuid, text, text, text, text[], text),
  public.start_maintenance(uuid, text, timestamptz),
  public.end_maintenance(uuid),
  public.request_device_command(uuid, text, uuid),
  public.list_agent_commands(uuid, uuid, text, text, int, int)
  from public, anon;

grant execute on function
  public.upsert_device(uuid, uuid, text, text, text, text[], text),
  public.start_maintenance(uuid, text, timestamptz),
  public.end_maintenance(uuid),
  public.request_device_command(uuid, text, uuid),
  public.list_agent_commands(uuid, uuid, text, text, int, int)
  to authenticated;
