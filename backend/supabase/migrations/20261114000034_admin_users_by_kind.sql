-- Every user has a kind, never "no role": a platform role (super admin, sales manager, sales employee),
-- a hall role (hall owner, hall employee), or, with neither, they are a player. The users page shows one
-- kind per tab, so the list filters by kind and returns the hall roles next to the platform roles.

drop function public.admin_list_users(text, integer, integer, text);
create function public.admin_list_users(
  p_search text default null, p_limit integer default 25, p_offset integer default 0, p_role text default null
) returns table (id uuid, display_name text, email text, status text, platform_roles text[], hall_roles text[],
                 halls_count integer, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  if p_role is not null
     and p_role not in ('super_admin', 'sales_admin', 'sales_agent', 'hall_owner', 'hall_employee', 'player') then
    perform public.raise_contract_error('VALIDATION', 'role');
  end if;
  return query
    select p.id, p.display_name, p.email, p.status,
           coalesce((select array_agg(a.role_key order by a.role_key) from public.user_role_assignments a where a.user_id = p.id), '{}'),
           coalesce((select array_agg(distinct m.role_key order by m.role_key) from public.hall_memberships m
                      where m.user_id = p.id and m.status = 'active'), '{}'),
           (select count(*)::int from public.hall_memberships m where m.user_id = p.id and m.status = 'active'),
           count(*) over ()
      from public.profiles p
     where (p_search is null or p.email ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%')
       and (p_role is null
            or (p_role in ('super_admin', 'sales_admin', 'sales_agent')
                and exists (select 1 from public.user_role_assignments a where a.user_id = p.id and a.role_key = p_role))
            or (p_role = 'hall_owner'
                and exists (select 1 from public.hall_memberships m where m.user_id = p.id and m.status = 'active' and m.role_key = 'owner'))
            or (p_role = 'hall_employee'
                and exists (select 1 from public.hall_memberships m where m.user_id = p.id and m.status = 'active' and m.role_key = 'employee'))
            or (p_role = 'player'
                and not exists (select 1 from public.user_role_assignments a where a.user_id = p.id)
                and not exists (select 1 from public.hall_memberships m where m.user_id = p.id and m.status = 'active')))
     order by p.created_at desc, p.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

drop function public.admin_user_role_counts();
create function public.admin_user_role_counts()
returns table (role_key text, n integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select r.k, case
      when r.k = 'all' then (select count(*)::int from public.profiles)
      when r.k in ('super_admin', 'sales_admin', 'sales_agent') then
        (select count(distinct a.user_id)::int from public.user_role_assignments a where a.role_key = r.k)
      when r.k = 'hall_owner' then
        (select count(distinct m.user_id)::int from public.hall_memberships m where m.status = 'active' and m.role_key = 'owner')
      when r.k = 'hall_employee' then
        (select count(distinct m.user_id)::int from public.hall_memberships m where m.status = 'active' and m.role_key = 'employee')
      else
        (select count(*)::int from public.profiles p
          where not exists (select 1 from public.user_role_assignments a where a.user_id = p.id)
            and not exists (select 1 from public.hall_memberships m where m.user_id = p.id and m.status = 'active'))
    end
    from (values ('all'), ('super_admin'), ('sales_admin'), ('sales_agent'), ('hall_owner'), ('hall_employee'), ('player')) r(k);
end $$;

revoke all on function public.admin_list_users(text, integer, integer, text) from public, anon;
revoke all on function public.admin_user_role_counts() from public, anon;
grant execute on function public.admin_list_users(text, integer, integer, text) to authenticated;
grant execute on function public.admin_user_role_counts() to authenticated;
