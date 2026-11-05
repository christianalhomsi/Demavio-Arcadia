-- Removes the "tenant" (business) concept: a hall is the customer (DEC-P26).
--
--  * `halls.tenant_id` and the `tenants` table are gone. Whether a hall is usable depends on its own status.
--  * A sale is credited to a hall: `sales_attributions.hall_id` replaces `tenant_id`, and a converted lead
--    points at its hall through `sales_leads.converted_hall_id`.
--  * Functions that only existed for tenants are dropped; the rest no longer mention them.
--  * Existing attributions move to the first hall of their old tenant; a tenant without any hall loses its
--    credit (there is nothing to attach it to).

set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Data: attributions and leads point at a hall instead of a tenant
-- ---------------------------------------------------------------------------
alter table public.sales_attributions add column hall_id uuid references public.halls (id);
update public.sales_attributions s
   set hall_id = (select h.id from public.halls h where h.tenant_id = s.tenant_id order by h.created_at limit 1);
delete from public.sales_attributions where hall_id is null;
alter table public.sales_attributions alter column hall_id set not null;
alter table public.sales_attributions drop column tenant_id;
create index sales_attributions_hall_fk_idx on public.sales_attributions (hall_id);

alter table public.sales_leads add column converted_hall_id uuid references public.halls (id);
update public.sales_leads l
   set converted_hall_id = (select h.id from public.halls h where h.tenant_id = l.tenant_id order by h.created_at limit 1)
 where l.tenant_id is not null;
alter table public.sales_leads drop column tenant_id;
create index sales_leads_converted_hall_fk_idx on public.sales_leads (converted_hall_id);

-- ---------------------------------------------------------------------------
-- Functions that existed only for tenants
-- ---------------------------------------------------------------------------
drop function public.admin_create_tenant(text, uuid);
drop function public.admin_create_hall(uuid, text, text, text, uuid);
drop function public.admin_list_tenants(text, int, int, uuid);
drop function public.admin_list_halls(uuid);
drop function public.admin_set_tenant_status(uuid, text, text);

-- ---------------------------------------------------------------------------
-- Functions whose result or signature changes
-- ---------------------------------------------------------------------------
drop function public.provision_hall(uuid, text, text, text, uuid);
create function public.provision_hall(p_name text, p_tz text, p_currency text, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 120 then
    perform public.raise_contract_error('VALIDATION', 'name');
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_tz) then
    perform public.raise_contract_error('VALIDATION', 'time_zone');
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    perform public.raise_contract_error('VALIDATION', 'currency');
  end if;
  insert into public.halls (name, time_zone, currency, created_by, create_key)
  values (btrim(p_name), p_tz, p_currency, auth.uid(), p_key) returning id into v_id;
  perform public.write_audit(v_id, 'admin.hall.create', 'hall', v_id::text, null, null,
    jsonb_build_object('name', btrim(p_name), 'time_zone', p_tz, 'currency', p_currency));
  return v_id;
end $$;

drop function public.admin_platform_metrics();
create function public.admin_platform_metrics()
returns table (halls_total integer, halls_active integer, users_total integer, leads_open integer,
               onboarding_pending integer, agents_total integer, agents_recent integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query select
    (select count(*)::int from public.halls),
    (select count(*)::int from public.halls where status = 'active'),
    (select count(*)::int from public.profiles),
    (select count(*)::int from public.sales_leads where status not in ('converted', 'lost')),
    (select count(*)::int from public.sales_leads where status = 'onboarding_submitted'),
    (select count(*)::int from public.agents),
    (select count(*)::int from public.agents where last_heartbeat_at > now() - interval '5 minutes');
end $$;

drop function public.admin_monitoring();
create function public.admin_monitoring()
returns table (hall_id uuid, hall_name text, hall_status text, agents_total integer, agents_recent integer,
               agents_never_seen integer, commands_failed_24h integer, commands_pending integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select h.id, h.name, h.status,
           (select count(*)::int from public.agents a where a.hall_id = h.id),
           (select count(*)::int from public.agents a where a.hall_id = h.id and a.last_heartbeat_at > now() - interval '5 minutes'),
           (select count(*)::int from public.agents a where a.hall_id = h.id and a.last_heartbeat_at is null),
           (select count(*)::int from public.agent_commands c where c.hall_id = h.id
              and c.status in ('Failed', 'TimedOut') and c.created_at > now() - interval '24 hours'),
           (select count(*)::int from public.agent_commands c where c.hall_id = h.id and c.status in ('Queued', 'Sent'))
      from public.halls h
     order by h.name;
end $$;

drop function public.list_attributions(int, int);
create function public.list_attributions(p_limit int default 25, p_offset int default 0)
returns table (id uuid, lead_id uuid, business_name text, hall_name text, agent_id uuid, agent_name text, status text,
               dispute_reason text, resolution_note text, created_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_sales_user();
  return query
    select s.id, s.lead_id, l.business_name, h.name, s.agent_id, coalesce(p.display_name, p.email), s.status,
           s.dispute_reason, s.resolution_note, s.created_at, count(*) over ()
      from public.sales_attributions s
      join public.sales_leads l on l.id = s.lead_id
      join public.halls h on h.id = s.hall_id
      join public.profiles p on p.id = s.agent_id
     where public.has_platform_role('sales_admin') or s.agent_id = auth.uid()
     order by (s.status = 'disputed') desc, s.created_at desc, s.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

drop function public.admin_list_halls_sold(text, int, int);
create function public.admin_list_halls_sold(p_search text default null, p_limit int default 25, p_offset int default 0)
returns table (hall_id uuid, hall_name text, hall_status text, currency text, owner_email text, owner_username text,
               sold_by_id uuid, sold_by_name text, sold_by_email text, sold_at timestamptz,
               attribution_status text, created_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select h.id, h.name, h.status, h.currency::text, o.email, o.username,
           s.agent_id, coalesce(p.display_name, p.email), p.email, s.created_at, s.status, h.created_at, count(*) over ()
      from public.halls h
      left join lateral (
        select pr.email, pr.username from public.hall_memberships m join public.profiles pr on pr.id = m.user_id
         where m.hall_id = h.id and m.role_key = 'owner' and m.status = 'active' order by m.created_at limit 1
      ) o on true
      left join public.sales_attributions s on s.hall_id = h.id
      left join public.profiles p on p.id = s.agent_id
     where p_search is null or h.name ilike '%' || p_search || '%'
        or o.email ilike '%' || p_search || '%'
        or p.email ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%'
     order by h.created_at desc, h.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Functions that only joined tenants to check their status
-- ---------------------------------------------------------------------------
create or replace function public.is_hall_member(p_hall_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_active_user() and exists (
    select 1
    from public.hall_memberships m
    join public.halls h on h.id = m.hall_id
    where m.hall_id = p_hall_id and m.user_id = auth.uid()
      and m.status = 'active' and h.status = 'active'
  );
$$;

create or replace function public.get_my_context() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_result jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    return null;
  end if;

  v_result := jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'display_name', v_profile.display_name,
      'email', v_profile.email,
      'status', v_profile.status,
      'avatar_url', v_profile.avatar_url,
      'username', v_profile.username
    ),
    'platform_roles', '[]'::jsonb,
    'memberships', '[]'::jsonb
  );

  -- Inactive profiles get no roles or memberships at all.
  if v_profile.status <> 'active' then
    return v_result;
  end if;

  v_result := jsonb_set(
    v_result, '{platform_roles}',
    coalesce(
      (select jsonb_agg(a.role_key order by a.role_key)
         from public.user_role_assignments a where a.user_id = v_uid),
      '[]'::jsonb
    )
  );

  v_result := jsonb_set(
    v_result, '{memberships}',
    coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'hall_id', h.id,
           'hall_name', h.name,
           'hall_status', h.status,
           'role', m.role_key,
           'permissions', case when h.status = 'active'
                               then to_jsonb(public.membership_permissions(m.id))
                               else '[]'::jsonb end,
           'discount_limit_minor', m.discount_limit_minor
         ) order by h.name
       )
       from public.hall_memberships m
       join public.halls h on h.id = m.hall_id
       where m.user_id = v_uid and m.status = 'active'),
      '[]'::jsonb
    )
  );

  return v_result;
end $$;

create or replace function public.get_public_hall(p_hall_id uuid)
returns table (id uuid, name text, time_zone text, currency character, working_hours jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select h.id, h.name, h.time_zone, h.currency,
         coalesce((select jsonb_agg(jsonb_build_object('weekday', w.weekday, 'opens', w.opens, 'closes', w.closes)
                                    order by w.weekday, w.opens)
                     from public.hall_working_hours w where w.hall_id = h.id), '[]'::jsonb)
    from public.halls h
   where h.id = p_hall_id and h.status = 'active';
$$;

create or replace function public.list_public_halls()
returns table (id uuid, name text, time_zone text, device_count integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select h.id, h.name, h.time_zone,
         (select count(*)::int from public.devices d where d.hall_id = h.id and d.status = 'active')
    from public.halls h
   where h.status = 'active'
   order by h.name;
$$;

create or replace function public.list_public_devices(p_hall_id uuid)
returns table (id uuid, name text, device_type text, category text, player_options integer[])
language sql stable security definer set search_path = public, pg_temp as $$
  select d.id, d.name, d.device_type, d.category, public.device_players_options(d.id)
    from public.devices d
    join public.halls h on h.id = d.hall_id
   where d.hall_id = p_hall_id and d.status = 'active' and h.status = 'active'
   order by d.name;
$$;

create or replace function public.list_public_device_busy(p_device_id uuid, p_from timestamptz, p_to timestamptz)
returns table (start_at timestamptz, end_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '8 days' then
    perform public.raise_contract_error('VALIDATION', 'period');
  end if;
  if not exists (
    select 1 from public.devices d
      join public.halls h on h.id = d.hall_id
     where d.id = p_device_id and d.status = 'active' and h.status = 'active'
  ) then
    perform public.raise_contract_error('NOT_FOUND');
  end if;

  return query
    select r.start_at, r.end_at
      from public.reservations r
     where r.device_id = p_device_id and r.status in ('pending', 'confirmed', 'checked_in')
       and r.start_at < p_to and r.end_at > p_from
    union all
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

create or replace function public.quote_public_price(p_device_id uuid, p_players int, p_start timestamptz, p_end timestamptz)
returns table (currency character, rate_per_hour_minor bigint, estimated_minor bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_hall uuid; v_cur char(3); v_opts int[]; v_rate bigint; v_s public.hall_settings; v_amount bigint;
begin
  if p_start is null or p_end is null or p_end <= p_start or p_end - p_start > interval '24 hours' then
    perform public.raise_contract_error('VALIDATION', 'time_range');
  end if;
  select d.hall_id, h.currency into v_hall, v_cur
    from public.devices d
    join public.halls h on h.id = d.hall_id
   where d.id = p_device_id and d.status = 'active' and h.status = 'active';
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

create or replace function public.create_player_reservation(
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
   where d.id = p_device_id and d.status = 'active' and h.status = 'active';
  if v_hall is null then perform public.raise_contract_error('NOT_FOUND'); end if;

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

create or replace function public.admin_search(p_query text, p_reason text)
returns table (kind text, id uuid, label text, detail text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_q text := btrim(coalesce(p_query, '')); v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.require_super_admin();
  if length(v_q) < 2 or length(v_q) > 100 then perform public.raise_contract_error('VALIDATION', 'query'); end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  perform public.write_audit(null, 'admin.search', 'search', null, v_reason, null, jsonb_build_object('query', v_q));
  return query
    (select 'hall'::text, h.id, h.name, h.status
       from public.halls h where h.name ilike '%' || v_q || '%' order by h.name limit 20)
    union all
    (select 'user'::text, p.id, coalesce(p.display_name, p.email), p.email || ' · ' || p.status
       from public.profiles p where p.email ilike '%' || v_q || '%' or p.display_name ilike '%' || v_q || '%' order by p.email limit 20);
end $$;

-- A converted lead becomes a hall (and an owner invitation); the sale is credited to that hall.
-- Retry-safe: converting twice returns the same hall.
create or replace function public.admin_convert_lead(p_lead_id uuid, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_l public.sales_leads; v_hall uuid; v_agent uuid; v_o jsonb;
begin
  perform public.require_super_admin();
  select * into v_l from public.sales_leads where id = p_lead_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if v_l.status = 'converted' then return v_l.converted_hall_id; end if;
  if v_l.status <> 'onboarding_submitted' or v_l.onboarding is null then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'not_submitted');
  end if;
  v_o := v_l.onboarding;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;

  v_hall := public.provision_hall(v_o ->> 'hall_name', 'Asia/Damascus',
    case when v_o ->> 'currency' in ('SYP', 'USD') then v_o ->> 'currency' else 'SYP' end, p_key);
  perform public.provision_owner_invitation(v_hall, v_o ->> 'owner_email');

  v_agent := coalesce(v_l.assigned_to, v_l.created_by);
  insert into public.sales_attributions (lead_id, hall_id, agent_id) values (p_lead_id, v_hall, v_agent);
  update public.sales_leads set status = 'converted', converted_hall_id = v_hall, updated_at = now() where id = p_lead_id;

  perform public.write_audit(null, 'admin.lead.convert', 'lead', p_lead_id::text, null, null,
    jsonb_build_object('hall_id', v_hall, 'agent_id', v_agent));
  return v_hall;
end $$;

create or replace function public.admin_create_hall_with_owner(
  p_hall_name text, p_currency text, p_email text, p_password text, p_username text, p_key uuid
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_hall uuid;
  v_owner uuid;
  v_name text := btrim(coalesce(p_hall_name, ''));
  v_currency text := upper(btrim(coalesce(p_currency, '')));
begin
  perform public.require_super_admin();
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
  select id into v_hall from public.halls where created_by = auth.uid() and create_key = p_key;
  if found then return v_hall; end if;

  if length(v_name) = 0 or length(v_name) > 120 then perform public.raise_contract_error('VALIDATION', 'name'); end if;
  if v_currency not in ('SYP', 'USD') then perform public.raise_contract_error('VALIDATION', 'currency'); end if;

  v_owner := public.create_login_user(p_email, p_password, p_username, v_name);
  v_hall := public.provision_hall(v_name, 'Asia/Damascus', v_currency, p_key);
  insert into public.hall_memberships (hall_id, user_id, role_key, status) values (v_hall, v_owner, 'owner', 'active');
  perform public.write_audit(v_hall, 'admin.hall.create_with_owner', 'hall', v_hall::text, null, null,
    jsonb_build_object('owner_id', v_owner, 'owner_email', lower(btrim(p_email))));
  return v_hall;
end $$;

create or replace function public.admin_delete_hall(p_hall_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_h public.halls; v_reason text := btrim(coalesce(p_reason, ''));
  r record; v_tables text[]; v_users uuid[]; v_u uuid; v_deleted int := 0; v_kept int := 0; v_owner text;
begin
  perform public.require_super_admin();
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  select * into v_h from public.halls where id = p_hall_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;

  select p.email into v_owner from public.hall_memberships m join public.profiles p on p.id = m.user_id
   where m.hall_id = p_hall_id and m.role_key = 'owner' order by m.created_at limit 1;

  -- Accounts that belong only to this hall: members with no other hall and no platform role.
  select coalesce(array_agg(m.user_id), '{}') into v_users
    from public.hall_memberships m
   where m.hall_id = p_hall_id
     and not exists (select 1 from public.hall_memberships o where o.user_id = m.user_id and o.hall_id <> p_hall_id)
     and not exists (select 1 from public.user_role_assignments a where a.user_id = m.user_id);

  perform public.make_fks_deferrable();
  select coalesce(array_agg(c.relname::text), '{}') into v_tables
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid and c.relkind = 'r'
   where a.attname = 'hall_id' and not a.attisdropped and c.relnamespace = 'public'::regnamespace
     and c.relname <> 'halls';

  set constraints all deferred;
  for r in select unnest(v_tables) as t loop
    execute format('alter table public.%I disable trigger user', r.t);
  end loop;
  alter table public.halls disable trigger user;
  alter table public.hall_membership_grants disable trigger user;

  delete from public.hall_membership_grants g
   using public.hall_memberships m where g.membership_id = m.id and m.hall_id = p_hall_id;
  -- The sales lead stays as a record; only its link to the deleted hall is cleared.
  update public.sales_leads set converted_hall_id = null where converted_hall_id = p_hall_id;
  for r in select unnest(v_tables) as t loop
    execute format('delete from public.%I where hall_id = $1', r.t) using p_hall_id;
  end loop;
  delete from public.halls where id = p_hall_id;

  -- Pending constraint checks must run before the triggers can be switched back on.
  set constraints all immediate;
  for r in select unnest(v_tables) as t loop
    execute format('alter table public.%I enable trigger user', r.t);
  end loop;
  alter table public.halls enable trigger user;
  alter table public.hall_membership_grants enable trigger user;

  foreach v_u in array v_users loop
    begin
      perform public.purge_user(v_u);
      v_deleted := v_deleted + 1;
    exception when others then
      v_kept := v_kept + 1;
    end;
  end loop;

  perform public.write_audit(null, 'admin.hall.delete', 'hall', p_hall_id::text, v_reason,
    jsonb_build_object('name', v_h.name, 'currency', v_h.currency, 'owner_email', v_owner),
    jsonb_build_object('accounts_deleted', v_deleted, 'accounts_kept', v_kept));
  return jsonb_build_object('accounts_deleted', v_deleted, 'accounts_kept', v_kept);
end $$;

-- ---------------------------------------------------------------------------
-- The tenant column and table go last
-- ---------------------------------------------------------------------------
-- The tenants table goes first (its policy reads halls.tenant_id), taking the foreign key with it.
drop table public.tenants cascade;
alter table public.halls drop column tenant_id;

revoke execute on function public.provision_hall(text, text, text, uuid) from public, anon, authenticated;
revoke execute on function
  public.admin_platform_metrics(), public.admin_monitoring(), public.list_attributions(int, int),
  public.admin_list_halls_sold(text, int, int)
  from public, anon, authenticated;
grant execute on function
  public.admin_platform_metrics(), public.admin_monitoring(), public.list_attributions(int, int),
  public.admin_list_halls_sold(text, int, int)
  to authenticated;
