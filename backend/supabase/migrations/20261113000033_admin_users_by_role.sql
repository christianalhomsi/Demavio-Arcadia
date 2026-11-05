-- The admin users page shows one platform role at a time: the list can be filtered by role
-- ('none' = people with no platform role, such as players and hall staff), and a second function
-- gives the number of people in each tab.

drop function public.admin_list_users(text, integer, integer);
create function public.admin_list_users(
  p_search text default null, p_limit integer default 25, p_offset integer default 0, p_role text default null
) returns table (id uuid, display_name text, email text, status text, platform_roles text[], halls_count integer, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  if p_role is not null and p_role <> 'none' and p_role not in ('super_admin', 'sales_admin', 'sales_agent') then
    perform public.raise_contract_error('VALIDATION', 'role');
  end if;
  return query
    select p.id, p.display_name, p.email, p.status,
           coalesce((select array_agg(a.role_key order by a.role_key) from public.user_role_assignments a where a.user_id = p.id), '{}'),
           (select count(*)::int from public.hall_memberships m where m.user_id = p.id and m.status = 'active'),
           count(*) over ()
      from public.profiles p
     where (p_search is null or p.email ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%')
       and (p_role is null
            or (p_role = 'none' and not exists (select 1 from public.user_role_assignments a where a.user_id = p.id))
            or (p_role <> 'none' and exists (select 1 from public.user_role_assignments a where a.user_id = p.id and a.role_key = p_role)))
     order by p.created_at desc, p.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.admin_user_role_counts()
returns table (role_key text, n integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select r.k, case r.k
      when 'all' then (select count(*)::int from public.profiles)
      when 'none' then (select count(*)::int from public.profiles p
                         where not exists (select 1 from public.user_role_assignments a where a.user_id = p.id))
      else (select count(distinct a.user_id)::int from public.user_role_assignments a where a.role_key = r.k)
    end
    from (values ('all'), ('super_admin'), ('sales_admin'), ('sales_agent'), ('none')) r(k);
end $$;

revoke all on function public.admin_list_users(text, integer, integer, text) from public, anon;
revoke all on function public.admin_user_role_counts() from public, anon;
grant execute on function public.admin_list_users(text, integer, integer, text) to authenticated;
grant execute on function public.admin_user_role_counts() to authenticated;
