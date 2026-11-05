-- Sales credits for sales managers: every lead with the stage it reached, its agent, and, once a hall
-- request was approved, "sold" with the name of the employee who sent that request.

create function public.list_sales_credits(p_limit integer default 25, p_offset integer default 0)
returns table (
  lead_id uuid, hall_name text, status text, agent_name text, sold_by_name text, sold_at timestamptz,
  created_at timestamptz, updated_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_platform_role('sales_admin') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select l.id, l.business_name, l.status,
           coalesce(pa.display_name, pa.email),
           coalesce(ps.display_name, ps.email), ap.updated_at,
           l.created_at, l.updated_at, count(*) over ()
      from public.sales_leads l
      left join public.profiles pa on pa.id = coalesce(l.assigned_to, l.created_by)
      left join lateral (
        select r.requested_by, r.updated_at
          from public.hall_requests r
         where r.lead_id = l.id and r.status = 'approved'
         order by r.updated_at desc limit 1) ap on true
      left join public.profiles ps on ps.id = ap.requested_by
     order by l.updated_at desc, l.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

revoke all on function public.list_sales_credits(integer, integer) from public, anon;
grant execute on function public.list_sales_credits(integer, integer) to authenticated;
