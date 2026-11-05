-- A sales employee picks the subscription the customer wants when sending a hall request, and the hall
-- that comes out of the approval gets that same plan, starting at the approval. Without a choice the
-- request is for the unlimited plan.

alter table public.hall_requests add column subscription_plan_id uuid references public.subscription_plans (id);

-- Puts a plan on a hall: its price as it is now, starting now and ending after the plan's period
-- (the unlimited plan never ends). Internal: only other database functions call it.
create function public.apply_hall_subscription(p_hall uuid, p_plan uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_plan public.subscription_plans; v_now timestamptz := now();
begin
  select * into v_plan from public.subscription_plans where id = p_plan;
  if not found then perform public.raise_contract_error('NOT_FOUND', 'plan'); end if;
  update public.halls
     set subscription_plan_id = v_plan.id, subscription_price_minor = v_plan.price_minor,
         subscription_currency = v_plan.currency, subscription_started_at = v_now,
         subscription_ends_at = case v_plan.period
           when 'monthly' then v_now + interval '1 month'
           when 'quarterly' then v_now + interval '3 months'
           when 'semiannual' then v_now + interval '6 months'
           when 'annual' then v_now + interval '12 months'
         end
   where id = p_hall;
end $$;
revoke all on function public.apply_hall_subscription(uuid, uuid) from public, anon, authenticated;

-- Employees choose among the active plans too, so they can see them.
create or replace function public.admin_list_subscription_plans()
returns table (id uuid, name text, price_minor bigint, currency text, status text, halls_count integer,
               created_at timestamptz, kind text, period text, details text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_admin boolean := public.has_platform_role('super_admin');
begin
  if not (v_admin or public.has_platform_role('sales_admin') or public.has_platform_role('sales_agent')) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select s.id, s.name, s.price_minor, s.currency::text, s.status,
           (select count(*)::int from public.halls h where h.subscription_plan_id = s.id),
           s.created_at, s.kind, s.period, s.details
      from public.subscription_plans s
     where v_admin or s.status = 'active'
     order by (s.kind = 'unlimited') desc, (s.status = 'active') desc,
              array_position(array['monthly', 'quarterly', 'semiannual', 'annual'], s.period), s.currency, s.price_minor, s.name;
end $$;

-- Adding a hall directly now shares the helper.
create or replace function public.admin_create_hall_with_owner(
  p_hall_name text, p_currency text, p_email text, p_password text, p_username text, p_key uuid,
  p_plan_id uuid default null
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
  if p_plan_id is not null and not exists (select 1 from public.subscription_plans where id = p_plan_id and status = 'active') then
    perform public.raise_contract_error('NOT_FOUND', 'plan');
  end if;

  v_owner := public.create_login_user(p_email, p_password, p_username, v_name);
  v_hall := public.provision_hall(v_name, 'Asia/Damascus', v_currency, p_key);
  if p_plan_id is not null then perform public.apply_hall_subscription(v_hall, p_plan_id); end if;
  insert into public.hall_memberships (hall_id, user_id, role_key, status) values (v_hall, v_owner, 'owner', 'active');
  if not v_admin then
    insert into public.sales_attributions (hall_id, agent_id) values (v_hall, auth.uid());
  end if;
  perform public.write_audit(v_hall, 'admin.hall.create_with_owner', 'hall', v_hall::text, null, null,
    jsonb_build_object('owner_id', v_owner, 'owner_email', lower(btrim(p_email)), 'plan_id', p_plan_id));
  return v_hall;
end $$;

-- The request carries the chosen plan.
drop function public.submit_hall_request(text, text, text, text, text);
create function public.submit_hall_request(
  p_hall_name text, p_currency text, p_owner_email text, p_owner_username text, p_owner_password text,
  p_plan_id uuid default null
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
  if p_plan_id is not null and not exists (select 1 from public.subscription_plans where id = p_plan_id and status = 'active') then
    perform public.raise_contract_error('NOT_FOUND', 'plan');
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
  insert into public.hall_requests (requested_by, manager_id, hall_name, currency, owner_email, owner_username,
                                    owner_password_hash, subscription_plan_id)
  values (auth.uid(), v_mgr, v_name, v_cur, v_email, v_user, crypt(p_owner_password, gen_salt('bf')), p_plan_id)
  returning id into v_id;
  perform public.write_audit(null, 'sales.hall_request.submit', 'hall_request', v_id::text, null, null,
    jsonb_build_object('hall_name', v_name, 'owner_email', v_email, 'plan_id', p_plan_id));
  return v_id;
end $$;

-- The approval gives the new hall the plan the request asked for.
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
  if v_r.subscription_plan_id is not null then
    perform public.apply_hall_subscription(v_hall, v_r.subscription_plan_id);
  end if;
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
                       'as_manager', v_is_mgr, 'as_admin', v_is_admin, 'plan_id', v_r.subscription_plan_id));
  return jsonb_build_object('status', 'approved', 'hall_id', v_hall);
end $$;

-- The requests list shows which plan each one asks for (for an approved one, what the hall got).
drop function public.list_hall_requests(text, integer, integer);
create function public.list_hall_requests(p_status text default null, p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, hall_name text, currency text, owner_email text, owner_username text,
  requested_by_name text, manager_name text, status text,
  rejected_reason text, hall_id uuid, can_act boolean, created_at timestamptz, total bigint,
  plan_name text, plan_kind text, plan_period text, plan_price_minor bigint, plan_currency text)
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
           r.created_at, count(*) over (),
           sp.name, sp.kind, sp.period,
           coalesce(h.subscription_price_minor, sp.price_minor),
           coalesce(h.subscription_currency::text, sp.currency::text)
      from public.hall_requests r
      left join public.profiles pr on pr.id = r.requested_by
      left join public.profiles pm on pm.id = r.manager_id
      left join public.halls h on h.id = r.hall_id
      left join public.subscription_plans sp on sp.id = coalesce(h.subscription_plan_id, r.subscription_plan_id)
     where (v_admin or r.requested_by = auth.uid() or r.manager_id = auth.uid() or (r.manager_id is null and v_sales_admin))
       and (p_status is null or r.status = p_status)
     order by (r.status = 'pending') desc, r.created_at desc, r.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

revoke all on function public.admin_list_subscription_plans() from public, anon;
revoke all on function public.submit_hall_request(text, text, text, text, text, uuid) from public, anon;
revoke all on function public.list_hall_requests(text, integer, integer) from public, anon;
revoke all on function public.approve_hall_request(uuid, uuid) from public, anon;
revoke all on function public.admin_create_hall_with_owner(text, text, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.admin_list_subscription_plans() to authenticated;
grant execute on function public.submit_hall_request(text, text, text, text, text, uuid) to authenticated;
grant execute on function public.list_hall_requests(text, integer, integer) to authenticated;
grant execute on function public.approve_hall_request(uuid, uuid) to authenticated;
grant execute on function public.admin_create_hall_with_owner(text, text, text, text, text, uuid, uuid) to authenticated;
