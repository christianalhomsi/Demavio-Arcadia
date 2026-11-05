-- Sales no longer works through leads:
--  * A sales agent sends a hall request directly; their manager (profiles.responsible_id) or a super
--    admin reviews it.
--  * A sales manager adds a hall directly, like a super admin, and is credited with it.
--  * A super admin assigns each agent to a manager; an agent can see who their manager is.
-- The old lead tables and functions stay in place, unused, so no existing data is lost.

alter table public.hall_requests alter column lead_id drop not null;
alter table public.sales_attributions alter column lead_id drop not null;
drop index public.hall_requests_one_pending_idx;

drop function public.submit_hall_request(uuid, text, text, text, text, text);
create function public.submit_hall_request(
  p_hall_name text, p_currency text, p_owner_email text, p_owner_username text, p_owner_password text
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_id uuid; v_mgr uuid;
  v_email text := lower(btrim(coalesce(p_owner_email, '')));
  v_user text := lower(btrim(coalesce(p_owner_username, '')));
  v_name text := btrim(coalesce(p_hall_name, ''));
  v_cur text := upper(btrim(coalesce(p_currency, '')));
begin
  perform public.require_sales_user();
  if length(v_name) not between 1 and 120 then perform public.raise_contract_error('VALIDATION', 'hall_name'); end if;
  if v_cur not in ('SYP', 'USD') then perform public.raise_contract_error('VALIDATION', 'currency'); end if;
  if not public.valid_email(v_email) then perform public.raise_contract_error('VALIDATION', 'email'); end if;
  if v_user !~ '^[a-z0-9_]{3,20}$' then perform public.raise_contract_error('VALIDATION', 'username'); end if;
  if p_owner_password is null or length(p_owner_password) < 8 or length(p_owner_password) > 72 then
    perform public.raise_contract_error('VALIDATION', 'password');
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email)
     or exists (select 1 from public.hall_requests where status = 'pending' and owner_email = v_email) then
    perform public.raise_contract_error('CONFLICT', 'email_taken');
  end if;
  if exists (select 1 from public.profiles where username = v_user)
     or exists (select 1 from public.hall_requests where status = 'pending' and owner_username = v_user) then
    perform public.raise_contract_error('CONFLICT', 'username_taken');
  end if;

  select responsible_id into v_mgr from public.profiles where id = auth.uid();
  insert into public.hall_requests (requested_by, manager_id, hall_name, currency, owner_email, owner_username, owner_password_hash)
  values (auth.uid(), v_mgr, v_name, v_cur, v_email, v_user, crypt(p_owner_password, gen_salt('bf')))
  returning id into v_id;
  perform public.write_audit(null, 'sales.hall_request.submit', 'hall_request', v_id::text, null, null,
    jsonb_build_object('hall_name', v_name, 'owner_email', v_email));
  return v_id;
end $$;

create or replace function public.approve_hall_request(p_request_id uuid, p_key uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_r public.hall_requests; v_is_admin boolean; v_is_mgr boolean; v_owner uuid; v_hall uuid;
begin
  v_is_admin := public.has_platform_role('super_admin');
  select * into v_r from public.hall_requests where id = p_request_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  v_is_mgr := (v_r.manager_id is not null and v_r.manager_id = auth.uid())
           or (v_r.manager_id is null and public.has_platform_role('sales_admin'));
  if not (v_is_admin or v_is_mgr) then perform public.raise_contract_error('PERMISSION_DENIED'); end if;
  if v_r.status <> 'pending' then perform public.raise_contract_error('PRECONDITION_FAILED', 'not_pending'); end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;

  v_owner := public.create_login_user_hashed(v_r.owner_email, v_r.owner_password_hash, v_r.owner_username, v_r.hall_name);
  v_hall := public.provision_hall(v_r.hall_name, 'Asia/Damascus', v_r.currency, p_key);
  insert into public.hall_memberships (hall_id, user_id, role_key, status) values (v_hall, v_owner, 'owner', 'active');
  insert into public.sales_attributions (hall_id, agent_id) values (v_hall, v_r.requested_by);
  update public.hall_requests
     set status = 'approved', hall_id = v_hall, owner_password_hash = null, updated_at = now(),
         manager_approved_by = case when v_is_mgr then auth.uid() end,
         manager_approved_at = case when v_is_mgr then now() end,
         admin_approved_by = case when v_is_admin then auth.uid() end,
         admin_approved_at = case when v_is_admin then now() end
   where id = p_request_id;
  perform public.write_audit(v_hall, 'sales.hall_request.activate', 'hall_request', p_request_id::text, null, null,
    jsonb_build_object('hall_id', v_hall, 'owner_id', v_owner, 'agent_id', v_r.requested_by,
                       'as_manager', v_is_mgr, 'as_admin', v_is_admin));
  return jsonb_build_object('status', 'approved', 'hall_id', v_hall);
end $$;

create or replace function public.reject_hall_request(p_request_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_r public.hall_requests; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_r from public.hall_requests where id = p_request_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if not (public.has_platform_role('super_admin')
          or (v_r.manager_id is not null and v_r.manager_id = auth.uid())
          or (v_r.manager_id is null and public.has_platform_role('sales_admin'))) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_r.status <> 'pending' then perform public.raise_contract_error('PRECONDITION_FAILED', 'not_pending'); end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  update public.hall_requests
     set status = 'rejected', rejected_by = auth.uid(), rejected_reason = v_reason, owner_password_hash = null, updated_at = now()
   where id = p_request_id;
  perform public.write_audit(null, 'sales.hall_request.reject', 'hall_request', p_request_id::text, null, null,
    jsonb_build_object('reason', v_reason));
end $$;

drop function public.list_hall_requests(text, integer, integer);
create function public.list_hall_requests(p_status text default null, p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, hall_name text, currency text, owner_email text, owner_username text,
  requested_by_name text, manager_name text, status text,
  rejected_reason text, hall_id uuid, can_act boolean, created_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_admin boolean := public.has_platform_role('super_admin'); v_sales_admin boolean := public.has_platform_role('sales_admin');
begin
  if not (v_admin or public.has_platform_role('sales_agent') or v_sales_admin) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select r.id, r.hall_name, r.currency, r.owner_email, r.owner_username,
           coalesce(pr.display_name, pr.email), coalesce(pm.display_name, pm.email), r.status,
           r.rejected_reason, r.hall_id,
           r.status = 'pending' and (
             v_admin
             or (r.manager_id is not null and r.manager_id = auth.uid())
             or (r.manager_id is null and v_sales_admin)),
           r.created_at, count(*) over ()
      from public.hall_requests r
      left join public.profiles pr on pr.id = r.requested_by
      left join public.profiles pm on pm.id = r.manager_id
     where (v_admin or r.requested_by = auth.uid() or r.manager_id = auth.uid() or (r.manager_id is null and v_sales_admin))
       and (p_status is null or r.status = p_status)
     order by (r.status = 'pending') desc, r.created_at desc, r.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- A sales manager adds a hall like a super admin; the hall is credited to them.
create or replace function public.admin_create_hall_with_owner(
  p_hall_name text, p_currency text, p_email text, p_password text, p_username text, p_key uuid
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_hall uuid;
  v_owner uuid;
  v_name text := btrim(coalesce(p_hall_name, ''));
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_admin boolean := public.has_platform_role('super_admin');
begin
  if not (v_admin or public.has_platform_role('sales_admin')) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
  select id into v_hall from public.halls where created_by = auth.uid() and create_key = p_key;
  if found then return v_hall; end if;

  if length(v_name) = 0 or length(v_name) > 120 then perform public.raise_contract_error('VALIDATION', 'name'); end if;
  if v_currency not in ('SYP', 'USD') then perform public.raise_contract_error('VALIDATION', 'currency'); end if;

  v_owner := public.create_login_user(p_email, p_password, p_username, v_name);
  v_hall := public.provision_hall(v_name, 'Asia/Damascus', v_currency, p_key);
  insert into public.hall_memberships (hall_id, user_id, role_key, status) values (v_hall, v_owner, 'owner', 'active');
  if not v_admin then
    insert into public.sales_attributions (hall_id, agent_id) values (v_hall, auth.uid());
  end if;
  perform public.write_audit(v_hall, 'admin.hall.create_with_owner', 'hall', v_hall::text, null, null,
    jsonb_build_object('owner_id', v_owner, 'owner_email', lower(btrim(p_email))));
  return v_hall;
end $$;

-- Credits are now simply the halls sold, and who sold them.
drop function public.list_sales_credits(integer, integer);
create function public.list_sales_credits(p_limit integer default 25, p_offset integer default 0)
returns table (hall_id uuid, hall_name text, sold_by_name text, sold_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_platform_role('sales_admin') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select h.id, h.name, coalesce(p.display_name, p.email), s.created_at, count(*) over ()
      from public.sales_attributions s
      join public.halls h on h.id = s.hall_id
      left join public.profiles p on p.id = s.agent_id
     order by s.created_at desc, h.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

drop function public.list_my_team();
create function public.list_my_team()
returns table (user_id uuid, display_name text, email text, status text, sold_count integer, open_requests integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_platform_role('sales_admin') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select p.id, p.display_name, p.email, p.status,
           (select count(*)::int from public.sales_attributions s where s.agent_id = p.id),
           (select count(*)::int from public.hall_requests r where r.requested_by = p.id and r.status = 'pending')
      from public.profiles p
      join public.user_role_assignments a on a.user_id = p.id and a.role_key = 'sales_agent'
     where p.responsible_id = auth.uid()
     order by p.display_name nulls last, p.email;
end $$;

-- Super admin: sets an agent's manager (null clears it). Waiting requests move to the new manager.
create function public.admin_set_sales_manager(p_user_id uuid, p_manager_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  if not exists (select 1 from public.user_role_assignments where user_id = p_user_id and role_key = 'sales_agent') then
    perform public.raise_contract_error('NOT_FOUND', 'agent');
  end if;
  if p_manager_id is not null and not exists (
    select 1 from public.profiles p join public.user_role_assignments a on a.user_id = p.id
     where p.id = p_manager_id and p.status = 'active' and a.role_key = 'sales_admin'
  ) then
    perform public.raise_contract_error('NOT_FOUND', 'manager');
  end if;
  update public.profiles set responsible_id = p_manager_id where id = p_user_id;
  update public.hall_requests set manager_id = p_manager_id, updated_at = now()
   where requested_by = p_user_id and status = 'pending';
  perform public.write_audit(null, 'admin.user.set_sales_manager', 'user', p_user_id::text, null, null,
    jsonb_build_object('manager_id', p_manager_id));
end $$;

-- The signed-in agent's manager, for the "Manager" page.
create function public.my_sales_manager()
returns table (display_name text, email text, username text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_sales_user();
  return query
    select m.display_name, m.email, m.username
      from public.profiles me
      join public.profiles m on m.id = me.responsible_id
     where me.id = auth.uid();
end $$;

revoke all on function public.submit_hall_request(text, text, text, text, text) from public, anon;
revoke all on function public.list_hall_requests(text, integer, integer) from public, anon;
revoke all on function public.list_sales_credits(integer, integer) from public, anon;
revoke all on function public.list_my_team() from public, anon;
revoke all on function public.admin_set_sales_manager(uuid, uuid) from public, anon;
revoke all on function public.my_sales_manager() from public, anon;
grant execute on function public.submit_hall_request(text, text, text, text, text) to authenticated;
grant execute on function public.list_hall_requests(text, integer, integer) to authenticated;
grant execute on function public.list_sales_credits(integer, integer) to authenticated;
grant execute on function public.list_my_team() to authenticated;
grant execute on function public.admin_set_sales_manager(uuid, uuid) to authenticated;
grant execute on function public.my_sales_manager() to authenticated;
