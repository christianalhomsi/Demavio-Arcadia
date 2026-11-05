-- Hall settings, working hours, employee invitations/management and audit access.
-- Web phase W5 (spec §4.3, §5.2, §7.1, §8.3-8.4, §21.3).
--
-- PROVISIONAL defaults (pending decisions DEC-02/03/04, see web/docs/planning/WEB_RISKS_AND_DECISIONS.md):
--   check-in grace 10 min, cancellation deadline 60 min, reminder 15 min, waiting list off.
-- Contract errors are raised as P0001 with the contract code as the message.

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------

alter table public.halls
  add column address text,
  add column contact_phone text;

create table public.hall_settings (
  hall_id                       uuid primary key references public.halls (id) on delete cascade,
  checkin_grace_minutes         int  not null default 10  check (checkin_grace_minutes between 0 and 1440),
  cancellation_deadline_minutes int  not null default 60  check (cancellation_deadline_minutes between 0 and 10080),
  reminder_minutes              int  not null default 15  check (reminder_minutes between 0 and 1440),
  waiting_list_enabled          boolean not null default false,
  allow_partial_payments        boolean not null default false,
  payment_methods               text[] not null default array['cash', 'wallet']
                                check (payment_methods <@ array['cash', 'wallet'] and cardinality(payment_methods) > 0),
  updated_at                    timestamptz not null default now()
);

create function public.create_default_hall_settings() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.hall_settings (hall_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger halls_default_settings
  after insert on public.halls
  for each row execute function public.create_default_hall_settings();

-- Backfill halls that already exist.
insert into public.hall_settings (hall_id) select id from public.halls on conflict do nothing;

-- Weekly opening hours. closes < opens means the range ends after midnight (assumption DEC-W06).
create table public.hall_working_hours (
  id       uuid primary key default gen_random_uuid(),
  hall_id  uuid not null references public.halls (id) on delete cascade,
  weekday  smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  opens    time not null,
  closes   time not null,
  check (opens <> closes)
);
create index hall_working_hours_hall_idx on public.hall_working_hours (hall_id, weekday);

create table public.hall_invitations (
  id          uuid primary key default gen_random_uuid(),
  hall_id     uuid not null references public.halls (id) on delete cascade,
  email       text not null,
  role_key    text not null references public.roles (key),
  token_hash  text not null unique,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by  uuid not null references public.profiles (id),
  expires_at  timestamptz not null default now() + interval '7 days',
  created_at  timestamptz not null default now()
);
create unique index hall_invitations_one_pending_idx
  on public.hall_invitations (hall_id, lower(email)) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

create function public.raise_contract_error(p_code text, p_detail text default null) returns void
language plpgsql as $$
begin
  raise exception '%', p_code using errcode = 'P0001', detail = coalesce(p_detail, '');
end $$;

create function public.write_audit(
  p_hall_id uuid, p_action text, p_target_type text, p_target_id text,
  p_reason text, p_before jsonb, p_after jsonb
) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_logs (actor_id, hall_id, action, target_type, target_id, reason, before_data, after_data)
  values (auth.uid(), p_hall_id, p_action, p_target_type, p_target_id, p_reason, p_before, p_after);
$$;

-- ---------------------------------------------------------------------------
-- Hall settings RPCs (permission: hall.settings.manage)
-- ---------------------------------------------------------------------------

create function public.update_hall_profile(
  p_hall_id uuid, p_name text, p_address text, p_contact_phone text, p_time_zone text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb;
begin
  if not public.has_hall_permission(p_hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 120 then
    perform public.raise_contract_error('VALIDATION', 'name');
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_time_zone) then
    perform public.raise_contract_error('VALIDATION', 'time_zone');
  end if;

  select jsonb_build_object('name', name, 'address', address, 'contact_phone', contact_phone, 'time_zone', time_zone)
    into v_before from public.halls where id = p_hall_id for update;

  update public.halls
     set name = btrim(p_name), address = nullif(btrim(p_address), ''),
         contact_phone = nullif(btrim(p_contact_phone), ''), time_zone = p_time_zone
   where id = p_hall_id;

  perform public.write_audit(p_hall_id, 'hall.profile.update', 'hall', p_hall_id::text, null, v_before,
    jsonb_build_object('name', btrim(p_name), 'address', nullif(btrim(p_address), ''),
                       'contact_phone', nullif(btrim(p_contact_phone), ''), 'time_zone', p_time_zone));
end $$;

create function public.update_hall_policies(
  p_hall_id uuid, p_checkin_grace_minutes int, p_cancellation_deadline_minutes int,
  p_reminder_minutes int, p_waiting_list_enabled boolean, p_allow_partial_payments boolean,
  p_payment_methods text[]
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb;
begin
  if not public.has_hall_permission(p_hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;

  select to_jsonb(s) - 'hall_id' - 'updated_at' into v_before
    from public.hall_settings s where hall_id = p_hall_id for update;

  begin
    update public.hall_settings
       set checkin_grace_minutes = p_checkin_grace_minutes,
           cancellation_deadline_minutes = p_cancellation_deadline_minutes,
           reminder_minutes = p_reminder_minutes,
           waiting_list_enabled = p_waiting_list_enabled,
           allow_partial_payments = p_allow_partial_payments,
           payment_methods = p_payment_methods,
           updated_at = now()
     where hall_id = p_hall_id;
  exception when check_violation or not_null_violation then
    perform public.raise_contract_error('VALIDATION');
  end;

  select to_jsonb(s) - 'hall_id' - 'updated_at' into v_after from public.hall_settings s where hall_id = p_hall_id;
  perform public.write_audit(p_hall_id, 'hall.policies.update', 'hall_settings', p_hall_id::text, null, v_before, v_after);
end $$;

-- p_hours: [{"weekday":1,"opens":"09:00","closes":"23:00"}, ...] replaces the whole week.
create function public.set_working_hours(p_hall_id uuid, p_hours jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb; v_after jsonb;
begin
  if not public.has_hall_permission(p_hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' then
    perform public.raise_contract_error('VALIDATION', 'hours');
  end if;

  -- Parse (a malformed time or weekday is a validation error, not a server error).
  begin
    perform 1 from jsonb_to_recordset(p_hours) as x(weekday smallint, opens time, closes time);
  exception when others then
    perform public.raise_contract_error('VALIDATION', 'hours');
  end;

  if exists (
    select 1 from jsonb_to_recordset(p_hours) as x(weekday smallint, opens time, closes time)
     where weekday is null or opens is null or closes is null
        or weekday not between 0 and 6 or opens = closes
  ) then
    perform public.raise_contract_error('VALIDATION', 'hours');
  end if;

  -- Overlap check on minute segments. An overnight range occupies [opens, 24:00) that day and
  -- [00:00, closes) on the next weekday.
  if exists (
    with h as (
      select row_number() over () as id, weekday, opens, closes
        from jsonb_to_recordset(p_hours) as x(weekday smallint, opens time, closes time)
    ), seg as (
      select id, weekday as d, (extract(epoch from opens)::int / 60) as s,
             case when closes > opens then extract(epoch from closes)::int / 60 else 1440 end as e
        from h
      union all
      select id, ((weekday + 1) % 7)::smallint, 0, extract(epoch from closes)::int / 60
        from h where closes < opens
    )
    select 1 from seg a join seg b on a.d = b.d and a.id <> b.id and a.s < b.e and b.s < a.e
  ) then
    perform public.raise_contract_error('VALIDATION', 'overlap');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('weekday', weekday, 'opens', opens, 'closes', closes)
                            order by weekday, opens), '[]'::jsonb)
    into v_before from public.hall_working_hours where hall_id = p_hall_id;

  delete from public.hall_working_hours where hall_id = p_hall_id;
  insert into public.hall_working_hours (hall_id, weekday, opens, closes)
    select p_hall_id, weekday, opens, closes
      from jsonb_to_recordset(p_hours) as x(weekday smallint, opens time, closes time);

  select coalesce(jsonb_agg(jsonb_build_object('weekday', weekday, 'opens', opens, 'closes', closes)
                            order by weekday, opens), '[]'::jsonb)
    into v_after from public.hall_working_hours where hall_id = p_hall_id;

  perform public.write_audit(p_hall_id, 'hall.working_hours.update', 'hall', p_hall_id::text, null, v_before, v_after);
end $$;

-- ---------------------------------------------------------------------------
-- Members and invitations (permission: employee.manage)
-- ---------------------------------------------------------------------------

create function public.list_hall_members(p_hall_id uuid)
returns table (
  membership_id uuid, user_id uuid, display_name text, email text, role_key text, status text,
  discount_limit_minor bigint, grants text[], created_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'employee.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select m.id, m.user_id, p.display_name, p.email, m.role_key, m.status, m.discount_limit_minor,
           coalesce((select array_agg(g.permission_key order by g.permission_key)
                       from public.hall_membership_grants g where g.membership_id = m.id), '{}'),
           m.created_at
      from public.hall_memberships m join public.profiles p on p.id = m.user_id
     where m.hall_id = p_hall_id
     order by m.status, p.display_name nulls last, p.email;
end $$;

create function public.list_hall_invitations(p_hall_id uuid)
returns table (id uuid, email text, role_key text, status text, expires_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'employee.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select i.id, i.email, i.role_key, i.status, i.expires_at, i.created_at
      from public.hall_invitations i where i.hall_id = p_hall_id and i.status = 'pending'
     order by i.created_at desc;
end $$;

-- Returns the one-time token; only its SHA-256 hash is stored. The web shows it once as an invite link.
create function public.invite_member(p_hall_id uuid, p_email text, p_role text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_token text; v_email text := lower(btrim(p_email)); v_id uuid;
begin
  if not public.has_hall_permission(p_hall_id, 'employee.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    perform public.raise_contract_error('VALIDATION', 'email');
  end if;
  if not exists (select 1 from public.roles where key = p_role and scope = 'hall') then
    perform public.raise_contract_error('VALIDATION', 'role');
  end if;
  if exists (select 1 from public.hall_memberships m join public.profiles p on p.id = m.user_id
              where m.hall_id = p_hall_id and lower(p.email) = v_email and m.status = 'active') then
    perform public.raise_contract_error('CONFLICT', 'already_member');
  end if;
  if exists (select 1 from public.hall_invitations
              where hall_id = p_hall_id and lower(email) = v_email and status = 'pending' and expires_at > now()) then
    perform public.raise_contract_error('CONFLICT', 'already_invited');
  end if;
  -- Expired pending invitations no longer block a re-invite.
  update public.hall_invitations set status = 'revoked'
   where hall_id = p_hall_id and lower(email) = v_email and status = 'pending' and expires_at <= now();

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.hall_invitations (hall_id, email, role_key, token_hash, invited_by)
  values (p_hall_id, v_email, p_role, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), auth.uid())
  returning id into v_id;

  perform public.write_audit(p_hall_id, 'employee.invite', 'invitation', v_id::text, null, null,
    jsonb_build_object('email', v_email, 'role', p_role));
  return v_token;
end $$;

create function public.revoke_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_hall uuid; v_email text;
begin
  select hall_id, email into v_hall, v_email from public.hall_invitations
   where id = p_invitation_id and status = 'pending';
  if v_hall is null or not public.has_hall_permission(v_hall, 'employee.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  update public.hall_invitations set status = 'revoked' where id = p_invitation_id;
  perform public.write_audit(v_hall, 'employee.invite.revoke', 'invitation', p_invitation_id::text, null,
    jsonb_build_object('email', v_email), null);
end $$;

-- The token is the proof of invitation (identities are never linked by email alone, spec §5.3);
-- the signed-in Google account's email must also match the invited address.
create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_inv public.hall_invitations; v_email text; v_membership uuid;
begin
  if auth.uid() is null or not public.is_active_user() then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  select lower(email) into v_email from public.profiles where id = auth.uid();

  select * into v_inv from public.hall_invitations
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
   for update;
  if not found or v_inv.status <> 'pending' or v_inv.expires_at <= now() or lower(v_inv.email) <> v_email then
    perform public.raise_contract_error('NOT_FOUND');
  end if;

  insert into public.hall_memberships (hall_id, user_id, role_key, status)
  values (v_inv.hall_id, auth.uid(), v_inv.role_key, 'active')
  on conflict (hall_id, user_id) do update set role_key = excluded.role_key, status = 'active'
  returning id into v_membership;

  update public.hall_invitations set status = 'accepted' where id = v_inv.id;
  perform public.write_audit(v_inv.hall_id, 'employee.invite.accept', 'membership', v_membership::text, null, null,
    jsonb_build_object('role', v_inv.role_key));
  return v_inv.hall_id;
end $$;

-- Change role / discount authority / extra grants. Guards against lockout and escalation.
create function public.update_member(
  p_membership_id uuid, p_role text, p_discount_limit_minor bigint, p_grants text[]
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m public.hall_memberships; v_before jsonb; v_grant text; v_grants text[] := coalesce(p_grants, '{}');
begin
  select * into v_m from public.hall_memberships where id = p_membership_id for update;
  if not found or not public.has_hall_permission(v_m.hall_id, 'employee.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_m.user_id = auth.uid() then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'cannot_modify_self');
  end if;
  if not exists (select 1 from public.roles where key = p_role and scope = 'hall') then
    perform public.raise_contract_error('VALIDATION', 'role');
  end if;
  if p_discount_limit_minor is not null and p_discount_limit_minor < 0 then
    perform public.raise_contract_error('VALIDATION', 'discount_limit');
  end if;
  if v_m.role_key = 'owner' and p_role <> 'owner' and v_m.status = 'active'
     and not exists (select 1 from public.hall_memberships
                      where hall_id = v_m.hall_id and role_key = 'owner' and status = 'active' and id <> v_m.id) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'last_owner');
  end if;

  -- Grants: hall-scoped permissions the caller holds themselves (no escalation).
  foreach v_grant in array v_grants loop
    if v_grant in ('platform.tenants.manage', 'sales.leads.manage')
       or not exists (select 1 from public.permissions where key = v_grant)
       or not public.has_hall_permission(v_m.hall_id, v_grant) then
      perform public.raise_contract_error('VALIDATION', 'grant');
    end if;
  end loop;

  select jsonb_build_object('role', v_m.role_key, 'discount_limit_minor', v_m.discount_limit_minor,
    'grants', coalesce((select jsonb_agg(permission_key order by permission_key)
                          from public.hall_membership_grants where membership_id = v_m.id), '[]'::jsonb))
    into v_before;

  update public.hall_memberships set role_key = p_role, discount_limit_minor = p_discount_limit_minor where id = v_m.id;
  delete from public.hall_membership_grants where membership_id = v_m.id;
  insert into public.hall_membership_grants (membership_id, permission_key)
    select v_m.id, g from unnest(v_grants) g on conflict do nothing;

  perform public.write_audit(v_m.hall_id, 'employee.update', 'membership', v_m.id::text, null, v_before,
    jsonb_build_object('role', p_role, 'discount_limit_minor', p_discount_limit_minor, 'grants', to_jsonb(v_grants)));
end $$;

create function public.set_member_status(p_membership_id uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m public.hall_memberships;
begin
  select * into v_m from public.hall_memberships where id = p_membership_id for update;
  if not found or not public.has_hall_permission(v_m.hall_id, 'employee.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_status not in ('active', 'inactive') then
    perform public.raise_contract_error('VALIDATION', 'status');
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    perform public.raise_contract_error('VALIDATION', 'reason');
  end if;
  if v_m.user_id = auth.uid() then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'cannot_modify_self');
  end if;
  if p_status = 'inactive' and v_m.role_key = 'owner' and v_m.status = 'active'
     and not exists (select 1 from public.hall_memberships
                      where hall_id = v_m.hall_id and role_key = 'owner' and status = 'active' and id <> v_m.id) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'last_owner');
  end if;

  update public.hall_memberships set status = p_status where id = v_m.id;
  perform public.write_audit(v_m.hall_id, 'employee.status', 'membership', v_m.id::text, btrim(p_reason),
    jsonb_build_object('status', v_m.status), jsonb_build_object('status', p_status));
end $$;

-- ---------------------------------------------------------------------------
-- Audit log read (permission: hall.settings.manage is the provisional audit-view permission)
-- ---------------------------------------------------------------------------

create function public.list_hall_audit(p_hall_id uuid, p_limit int default 25, p_offset int default 0, p_action text default null)
returns table (
  id uuid, created_at timestamptz, actor_id uuid, actor_name text, action text,
  target_type text, target_id text, reason text, before_data jsonb, after_data jsonb, total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select a.id, a.created_at, a.actor_id, coalesce(p.display_name, p.email), a.action,
           a.target_type, a.target_id, a.reason, a.before_data, a.after_data, count(*) over ()
      from public.audit_logs a left join public.profiles p on p.id = a.actor_id
     where a.hall_id = p_hall_id and (p_action is null or a.action like p_action || '%')
     order by a.created_at desc, a.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------------

alter table public.hall_settings      enable row level security;
alter table public.hall_working_hours enable row level security;
alter table public.hall_invitations   enable row level security;

create policy hall_settings_select on public.hall_settings
  for select to authenticated using (public.is_hall_member(hall_id));
create policy hall_working_hours_select on public.hall_working_hours
  for select to authenticated using (public.is_hall_member(hall_id));
-- Invitations are read only through list_hall_invitations (no token hashes exposed).

grant select on public.hall_settings, public.hall_working_hours to authenticated;

-- Do not rely on default privileges: reset every function, then grant only the client-facing API.
-- (Found by tests: internal helpers such as write_audit were callable by clients.)
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.get_my_context(),
  public.has_hall_permission(uuid, text),
  public.is_hall_member(uuid),
  public.has_platform_role(text),
  public.update_hall_profile(uuid, text, text, text, text),
  public.update_hall_policies(uuid, int, int, int, boolean, boolean, text[]),
  public.set_working_hours(uuid, jsonb),
  public.list_hall_members(uuid),
  public.list_hall_invitations(uuid),
  public.invite_member(uuid, text, text),
  public.revoke_invitation(uuid),
  public.accept_invitation(text),
  public.update_member(uuid, text, bigint, text[]),
  public.set_member_status(uuid, text, text),
  public.list_hall_audit(uuid, int, int, text)
  to authenticated;
