-- Leads are gone. Sales now works through hall requests (agents) and direct hall creation (managers),
-- so the lead table, its onboarding flow, its reports and every function that touched them are removed.
-- The data of the lead table is deleted with it.

-- The table goes first (its policies, indexes and foreign keys go with it, and its policy used can_see_lead).
alter table public.hall_requests drop column lead_id;
alter table public.sales_attributions drop column lead_id;
drop table public.sales_leads;

-- Functions that only served leads.
drop function public.upsert_lead(uuid, text, text, text, text, text, text, text, uuid);
drop function public.list_leads(text, integer, integer, uuid);
drop function public.assign_lead(uuid, uuid);
drop function public.can_see_lead(uuid, uuid);
drop function public.submit_onboarding(uuid, jsonb);
drop function public.admin_list_onboarding_requests();
drop function public.admin_convert_lead(uuid, uuid);
drop function public.sales_report(timestamptz, timestamptz);
drop function public.list_attributions(integer, integer);

-- Functions that counted leads.
drop function public.admin_platform_metrics();
create function public.admin_platform_metrics()
returns table (halls_total integer, halls_active integer, users_total integer, agents_total integer, agents_recent integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query select
    (select count(*)::int from public.halls),
    (select count(*)::int from public.halls where status = 'active'),
    (select count(*)::int from public.profiles),
    (select count(*)::int from public.agents),
    (select count(*)::int from public.agents where last_heartbeat_at > now() - interval '5 minutes');
end $$;

drop function public.list_sales_agents();
create function public.list_sales_agents()
returns table (user_id uuid, display_name text, email text, status text, attributions_count integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_platform_role('sales_admin') then perform public.raise_contract_error('PERMISSION_DENIED'); end if;
  return query
    select p.id, p.display_name, p.email, p.status,
           (select count(*)::int from public.sales_attributions s where s.agent_id = p.id)
      from public.user_role_assignments a join public.profiles p on p.id = a.user_id
     where a.role_key = 'sales_agent' order by p.display_name nulls last, p.email;
end $$;

drop function public.admin_list_sales_team();
create function public.admin_list_sales_team()
returns table (user_id uuid, display_name text, email text, username text, role_key text, status text,
               responsible_id uuid, responsible_name text, halls_sold integer, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select p.id, p.display_name, p.email, p.username, a.role_key, p.status,
           p.responsible_id, coalesce(r.display_name, r.email),
           (select count(*)::int from public.sales_attributions s where s.agent_id = p.id),
           p.created_at
      from public.user_role_assignments a
      join public.profiles p on p.id = a.user_id
      left join public.profiles r on r.id = p.responsible_id
     where a.role_key in ('sales_agent', 'sales_admin')
     order by a.role_key, p.display_name nulls last, p.email;
end $$;

-- Deleting a hall no longer has a lead record to detach.
create or replace function public.admin_delete_hall(p_hall_id uuid, p_reason text)
returns jsonb
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
  for r in select unnest(v_tables) as t loop
    execute format('delete from public.%I where hall_id = $1', r.t) using p_hall_id;
  end loop;
  delete from public.halls where id = p_hall_id;

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

-- The permission that only guarded leads.
create or replace function public.update_member(p_membership_id uuid, p_role text, p_discount_limit_minor bigint, p_grants text[])
returns void
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

  foreach v_grant in array v_grants loop
    if v_grant = 'platform.tenants.manage'
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

delete from public.role_permissions where permission_key = 'sales.leads.manage';
delete from public.permissions where key = 'sales.leads.manage';

revoke all on function public.admin_platform_metrics() from public, anon;
revoke all on function public.list_sales_agents() from public, anon;
revoke all on function public.admin_list_sales_team() from public, anon;
revoke all on function public.admin_delete_hall(uuid, text) from public, anon;
revoke all on function public.update_member(uuid, text, bigint, text[]) from public, anon;
grant execute on function public.admin_platform_metrics() to authenticated;
grant execute on function public.list_sales_agents() to authenticated;
grant execute on function public.admin_list_sales_team() to authenticated;
grant execute on function public.admin_delete_hall(uuid, text) to authenticated;
grant execute on function public.update_member(uuid, text, bigint, text[]) to authenticated;
