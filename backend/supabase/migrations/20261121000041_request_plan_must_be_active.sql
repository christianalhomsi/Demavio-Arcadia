-- A deactivated plan is gone for good: it cannot be asked for, and a request that asked for one before it
-- was deactivated cannot be approved either (the approver rejects it and the employee asks again with a
-- plan that is on offer). The requests list says whether the asked-for plan is still available.

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
  if v_r.subscription_plan_id is not null
     and not exists (select 1 from public.subscription_plans where id = v_r.subscription_plan_id and status = 'active') then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'plan_inactive');
  end if;

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

drop function public.list_hall_requests(text, integer, integer);
create function public.list_hall_requests(p_status text default null, p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, hall_name text, currency text, owner_email text, owner_username text,
  requested_by_name text, manager_name text, status text,
  rejected_reason text, hall_id uuid, can_act boolean, created_at timestamptz, total bigint,
  plan_name text, plan_kind text, plan_period text, plan_price_minor bigint, plan_currency text,
  plan_available boolean)
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
           coalesce(h.subscription_currency::text, sp.currency::text),
           -- a request with no plan asks for the unlimited one, which is always available
           (r.subscription_plan_id is null or sp.status = 'active' or r.status <> 'pending')
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

revoke all on function public.approve_hall_request(uuid, uuid) from public, anon;
revoke all on function public.list_hall_requests(text, integer, integer) from public, anon;
grant execute on function public.approve_hall_request(uuid, uuid) to authenticated;
grant execute on function public.list_hall_requests(text, integer, integer) to authenticated;
