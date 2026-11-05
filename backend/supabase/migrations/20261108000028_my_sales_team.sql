-- The agents a sales manager is responsible for (profiles.responsible_id = the manager), with counts.

create function public.list_my_team()
returns table (
  user_id uuid, display_name text, email text, status text,
  leads_count integer, sold_count integer, open_requests integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_platform_role('sales_admin') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select p.id, p.display_name, p.email, p.status,
           (select count(*)::int from public.sales_leads l where coalesce(l.assigned_to, l.created_by) = p.id),
           (select count(*)::int from public.sales_leads l
             where coalesce(l.assigned_to, l.created_by) = p.id and l.status = 'converted'),
           (select count(*)::int from public.hall_requests r
             where r.requested_by = p.id and r.status = 'pending')
      from public.profiles p
      join public.user_role_assignments a on a.user_id = p.id and a.role_key = 'sales_agent'
     where p.responsible_id = auth.uid()
     order by p.display_name nulls last, p.email;
end $$;

revoke all on function public.list_my_team() from public, anon;
grant execute on function public.list_my_team() to authenticated;
