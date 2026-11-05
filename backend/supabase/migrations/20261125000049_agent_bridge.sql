-- Agent bridge: the cloud side of the Windows Agent / Hall Server link.
-- Design: web/docs/planning/windows-agent/ (security model, command contract).
--
-- Trust model: the Hall Server holds ONE credential per hall (a random token; only its SHA-256 is stored here).
-- It talks to the `agent-bridge` Edge Function, which authenticates the token and then calls the bridge_* functions
-- below with the service role. No service-role key or database key ever lives on a PC. The bridge_* functions are
-- executable by service_role only, never by anon/authenticated.
--
-- NOT applied to any hosted project by this file being in the repo. Apply only with explicit approval.

-- ---------------------------------------------------------------------------
-- Command statuses used by the contract, and a stable cursor for durable pull
-- ---------------------------------------------------------------------------
alter table public.agent_commands drop constraint agent_commands_status_check;
alter table public.agent_commands add constraint agent_commands_status_check check (status in
  ('Queued', 'Sent', 'Acknowledged', 'Executed', 'Failed', 'TimedOut', 'Canceled', 'Expired', 'Rejected', 'Unknown'));

alter table public.agent_commands add column seq bigint generated always as identity;
create unique index agent_commands_seq_idx on public.agent_commands (seq);

-- ---------------------------------------------------------------------------
-- Hall Servers and pairing codes
-- ---------------------------------------------------------------------------
create table public.hall_servers (
  id            uuid primary key default gen_random_uuid(),
  hall_id       uuid not null references public.halls (id),
  name          text not null check (length(btrim(name)) between 1 and 80),
  token_hash    text not null unique,
  version       text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz
);
create index hall_servers_hall_idx on public.hall_servers (hall_id);

alter table public.agents
  add column paired_at      timestamptz,
  add column hall_server_id uuid references public.hall_servers (id);

-- One-time, expiring codes (10 minutes). Only the hash is stored; the plaintext is shown once to the owner.
create table public.pairing_codes (
  id          uuid primary key default gen_random_uuid(),
  hall_id     uuid not null references public.halls (id),
  kind        text not null check (kind in ('agent', 'hall_server')),
  code_hash   text not null unique,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index pairing_codes_hall_idx on public.pairing_codes (hall_id, kind) where used_at is null;

alter table public.hall_servers  enable row level security;
alter table public.pairing_codes enable row level security;

create policy hall_servers_select on public.hall_servers
  for select to authenticated using (public.has_hall_permission(hall_id, 'hall.settings.manage'));
-- pairing_codes: no policy and no grant = unreadable by clients.

-- Supabase grants new tables to anon/authenticated by default; this repo's convention (migration 0009) is read-only
-- clients, and token_hash must never be readable.
revoke all on public.hall_servers, public.pairing_codes from anon, authenticated;
grant select (id, hall_id, name, version, created_at, last_seen_at, revoked_at) on public.hall_servers to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.pairing_code_hash(p_code text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')), 'utf8')), 'hex')
$$;

-- What the Hall Server needs to send to a PC. START/END/SYNC_STATE only carry a session id in the queue, so the
-- schedule is read from the session at pull time (always the current end time). SYNC_STATE with a live session
-- becomes EXTEND_SESSION (extend / convert-to-open queue it today); for an ended session it becomes END_SESSION,
-- so a late START can never unlock a PC whose session is already over.
create function public.agent_command_wire(p_cmd public.agent_commands) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_s public.sessions; v_type text := p_cmd.command_type; v_end timestamptz; v_live boolean;
begin
  if p_cmd.session_id is not null then
    select * into v_s from public.sessions where id = p_cmd.session_id;
  end if;

  if v_type in ('START_SESSION', 'END_SESSION', 'SYNC_STATE') and v_s.id is not null then
    v_live := v_s.status in ('starting', 'in_progress', 'ending');
    if v_type = 'SYNC_STATE' then
      v_type := case when v_live then 'EXTEND_SESSION' else 'END_SESSION' end;
    elsif v_type = 'START_SESSION' and not v_live then
      v_type := 'END_SESSION';
    end if;
    v_end := coalesce(v_s.ended_at, v_s.scheduled_end_at);
    return jsonb_build_object('type', v_type, 'payload', jsonb_build_object(
      'sessionId', v_s.id,
      'sessionRevision', 0,                       -- issued by the Hall Server
      'startAtUtc', v_s.started_at,
      'endAtUtc', v_end,
      'durationMs', case when v_end is null then 0
                         else (extract(epoch from (v_end - v_s.started_at)) * 1000)::bigint end,
      'warnAtMs', jsonb_build_array(300000, 60000)));
  end if;

  if v_type in ('LOCK', 'UNLOCK') then
    return jsonb_build_object('type', v_type, 'payload',
      jsonb_build_object('reason', 'staff', 'sessionId', p_cmd.session_id, 'sessionRevision', null));
  elsif v_type in ('SHUTDOWN', 'RESTART') then
    return jsonb_build_object('type', v_type, 'payload', jsonb_build_object('graceSeconds', 30, 'reason', 'staff'));
  end if;
  return jsonb_build_object('type', v_type, 'payload', '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Owner-facing RPCs (authenticated)
-- ---------------------------------------------------------------------------
create function public.create_pairing_code(p_hall_id uuid, p_kind text)
returns table (pairing_code text, valid_until timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_raw text; v_exp timestamptz := now() + interval '10 minutes';
begin
  if not public.has_hall_permission(p_hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_kind not in ('agent', 'hall_server') then
    perform public.raise_contract_error('VALIDATION', 'kind');
  end if;
  v_raw := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)); -- 48 random bits, 10 minutes, one use
  -- Only the newest code of a kind works.
  update public.pairing_codes set used_at = now()
   where hall_id = p_hall_id and kind = p_kind and used_at is null;
  insert into public.pairing_codes (hall_id, kind, code_hash, created_by, expires_at)
  values (p_hall_id, p_kind, public.pairing_code_hash(v_raw), auth.uid(), v_exp);
  perform public.write_audit(p_hall_id, 'pairing.code.create', 'pairing_code', null, null, null,
    jsonb_build_object('kind', p_kind));
  return query select substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4), v_exp;
end $$;

create function public.revoke_hall_server(p_hall_server_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_hs public.hall_servers;
begin
  select * into v_hs from public.hall_servers where id = p_hall_server_id;
  if not found or not public.has_hall_permission(v_hs.hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  update public.hall_servers set revoked_at = coalesce(revoked_at, now()) where id = p_hall_server_id;
  perform public.write_audit(v_hs.hall_id, 'hall_server.revoke', 'hall_server', p_hall_server_id::text, null, null, null);
end $$;

-- ---------------------------------------------------------------------------
-- Bridge functions (service_role only; called by the agent-bridge Edge Function)
-- ---------------------------------------------------------------------------

-- Token check. Returns no row for an unknown or revoked token.
create function public.bridge_authenticate(p_token_hash text, p_version text default null)
returns table (hall_server_id uuid, hall_id uuid)
language sql security definer set search_path = public, pg_temp as $$
  update public.hall_servers
     set last_seen_at = now(), version = coalesce(p_version, version)
   where token_hash = p_token_hash and revoked_at is null
  returning id, hall_id
$$;

-- Hall Server pairing: consumes a one-time code and registers the server with the hash of the token the Edge
-- Function generated. Returns the hall id.
create function public.bridge_redeem_hall_server_code(p_code text, p_name text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_c public.pairing_codes;
begin
  select * into v_c from public.pairing_codes
   where code_hash = public.pairing_code_hash(p_code) and kind = 'hall_server' for update;
  if not found or v_c.used_at is not null or v_c.expires_at < now() then
    perform public.raise_contract_error('NOT_FOUND', 'invalid_or_expired_code');
  end if;
  if p_token_hash is null or length(p_token_hash) <> 64 then
    perform public.raise_contract_error('VALIDATION', 'token_hash');
  end if;
  update public.pairing_codes set used_at = now() where id = v_c.id;
  insert into public.hall_servers (hall_id, name, token_hash)
  values (v_c.hall_id, left(coalesce(nullif(btrim(p_name), ''), 'Hall Server'), 80), p_token_hash);
  perform public.write_audit(v_c.hall_id, 'hall_server.pair', 'hall_server', null, null, null, null);
  return v_c.hall_id;
end $$;

-- Agent pairing (relayed by the Hall Server): consumes a one-time agent code for the server's own hall, checks the
-- device is an active PC of that hall, and creates the agent row (which is what lets staff send commands).
create function public.bridge_redeem_agent_code(p_hall_id uuid, p_hall_server_id uuid, p_code text, p_device_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_c public.pairing_codes; v_d public.devices;
begin
  if not exists (select 1 from public.hall_servers
                  where id = p_hall_server_id and hall_id = p_hall_id and revoked_at is null) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  select * into v_c from public.pairing_codes
   where code_hash = public.pairing_code_hash(p_code) and kind = 'agent' and hall_id = p_hall_id for update;
  if not found or v_c.used_at is not null or v_c.expires_at < now() then
    perform public.raise_contract_error('NOT_FOUND', 'invalid_or_expired_code');
  end if;
  select * into v_d from public.devices where id = p_device_id and hall_id = p_hall_id;
  if not found or v_d.device_type <> 'pc' or v_d.status <> 'active' then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'device_not_pairable');
  end if;
  update public.pairing_codes set used_at = now() where id = v_c.id;
  insert into public.agents (hall_id, device_id, paired_at, hall_server_id, sync_state)
  values (p_hall_id, p_device_id, now(), p_hall_server_id, 'unknown')
  on conflict (device_id) do update
    set paired_at = now(), hall_server_id = excluded.hall_server_id, last_error = null, sync_state = 'unknown';
  perform public.write_audit(p_hall_id, 'agent.pair', 'device', p_device_id::text, null, null, null);
  return p_hall_id;
end $$;

-- Durable pull. Stale Queued commands are expired first (a late LOCK/SHUTDOWN is never delivered), then everything
-- after the cursor that is still Queued is returned in order. Safe to call repeatedly: the Hall Server de-duplicates
-- by idempotency key (the command id).
create function public.bridge_pull_commands(p_hall_id uuid, p_cursor bigint default 0, p_limit int default 100)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rows jsonb; v_max bigint;
begin
  with stale as (
    update public.agent_commands
       set status = 'Expired', updated_at = now()
     where hall_id = p_hall_id and status = 'Queued'
       and created_at < now() - (case when command_type in ('LOCK', 'UNLOCK', 'SHUTDOWN', 'RESTART')
                                      then interval '5 minutes' else interval '30 minutes' end)
    returning id
  )
  insert into public.agent_command_events (command_id, hall_id, status, detail)
  select id, p_hall_id, 'Expired', 'not delivered in time' from stale;

  with page as (
    select c.* from public.agent_commands c
     where c.hall_id = p_hall_id and c.status = 'Queued' and c.seq > coalesce(p_cursor, 0)
     order by c.seq
     limit least(greatest(coalesce(p_limit, 100), 1), 200)
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'commandId', p.id, 'hallId', p.hall_id, 'stationId', p.device_id,
             'type', public.agent_command_wire(p) ->> 'type',
             'payload', public.agent_command_wire(p) -> 'payload',
             'idempotencyKey', p.id::text) order by p.seq), '[]'::jsonb),
         max(p.seq)
    into v_rows, v_max
    from page p;

  return jsonb_build_object('commands', v_rows, 'cursor', coalesce(v_max, coalesce(p_cursor, 0)));
end $$;

-- Status report. Monotonic: a terminal status is never overwritten and a duplicate report is a no-op. Returns true
-- if the row changed. Only commands of the caller's own hall can be touched.
create function public.bridge_report_command(
  p_hall_id uuid, p_command_id uuid, p_status text, p_result jsonb default null, p_error text default null
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_c public.agent_commands; v_old int; v_new int;
begin
  if p_status not in ('Sent', 'Acknowledged', 'Executed', 'Failed', 'TimedOut', 'Expired', 'Rejected', 'Unknown') then
    perform public.raise_contract_error('VALIDATION', 'status');
  end if;
  select * into v_c from public.agent_commands where id = p_command_id and hall_id = p_hall_id for update;
  if not found then return false; end if;

  if v_c.status in ('Executed', 'Failed', 'TimedOut', 'Expired', 'Rejected', 'Canceled') or v_c.status = p_status then
    return false;
  end if;
  v_old := case v_c.status when 'Queued' then 0 when 'Sent' then 1 when 'Acknowledged' then 2 else 3 end;
  v_new := case p_status when 'Sent' then 1 when 'Acknowledged' then 2 when 'Unknown' then 3 else 4 end;
  if v_new < v_old then return false; end if;

  update public.agent_commands
     set status = p_status, updated_at = now(),
         response = coalesce(p_result, response),
         error_message = coalesce(left(p_error, 500), error_message)
   where id = p_command_id;
  insert into public.agent_command_events (command_id, hall_id, status, detail)
  values (p_command_id, p_hall_id, p_status, left(p_error, 500));

  if p_status = 'Executed' then
    update public.agents set last_success_command_at = now(), last_error = null where device_id = v_c.device_id;
  elsif p_status in ('Failed', 'Rejected') then
    update public.agents set last_error = left(coalesce(p_error, p_result ->> 'failureReason', p_status), 500)
     where device_id = v_c.device_id;
  end if;
  return true;
end $$;

-- Batched heartbeats from the Hall Server (one request per ~30 s instead of one per PC). Time is the cloud's, never
-- the PC's. Devices of other halls and devices without an agent row are ignored.
create function public.bridge_heartbeat_batch(p_hall_id uuid, p_items jsonb) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    perform public.raise_contract_error('VALIDATION', 'items');
  end if;
  update public.agents a
     set last_heartbeat_at = now(),
         version = coalesce(left(i.version, 40), a.version),
         sync_state = case when i.session = 'Unknown' or i.reliability = 'Uncertain' then 'out_of_sync' else 'synced' end
    from (select (e ->> 'stationId')::uuid as device_id, e ->> 'version' as version,
                 e ->> 'session' as session, e ->> 'reliability' as reliability
            from jsonb_array_elements(p_items) e) i
   where a.device_id = i.device_id and a.hall_id = p_hall_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.pairing_code_hash(text),
  public.agent_command_wire(public.agent_commands),
  public.create_pairing_code(uuid, text),
  public.revoke_hall_server(uuid),
  public.bridge_authenticate(text, text),
  public.bridge_redeem_hall_server_code(text, text, text),
  public.bridge_redeem_agent_code(uuid, uuid, text, uuid),
  public.bridge_pull_commands(uuid, bigint, int),
  public.bridge_report_command(uuid, uuid, text, jsonb, text),
  public.bridge_heartbeat_batch(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.create_pairing_code(uuid, text), public.revoke_hall_server(uuid) to authenticated;

grant execute on function
  public.pairing_code_hash(text),
  public.agent_command_wire(public.agent_commands),
  public.bridge_authenticate(text, text),
  public.bridge_redeem_hall_server_code(text, text, text),
  public.bridge_redeem_agent_code(uuid, uuid, text, uuid),
  public.bridge_pull_commands(uuid, bigint, int),
  public.bridge_report_command(uuid, uuid, text, jsonb, text),
  public.bridge_heartbeat_batch(uuid, jsonb)
  to service_role;
