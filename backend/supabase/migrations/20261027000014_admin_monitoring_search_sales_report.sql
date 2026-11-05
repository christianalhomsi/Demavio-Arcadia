-- P2 platform features (ADM-006, ADM-007, SALES-007). Read-only; no hall financial data anywhere.
--  * admin_monitoring: operational health per hall (Agents, command failures). Deliberately NO cash,
--    payment or discrepancy figures: a super admin has no hall financial permissions (REQ-ADM-04).
--  * admin_search: cross-hall search of tenants, halls and users by name/email. A reason is required and
--    every search is audited with the query text.
--  * sales_report: lead pipeline per agent for a period. Sales admin only; no finance.

create function public.admin_monitoring()
returns table (hall_id uuid, hall_name text, tenant_name text, hall_status text, agents_total int, agents_recent int,
               agents_never_seen int, commands_failed_24h int, commands_pending int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select h.id, h.name, t.name, h.status,
           (select count(*)::int from public.agents a where a.hall_id = h.id),
           -- "recent" = heartbeat in the last 5 minutes (PROVISIONAL, same threshold as the metrics card)
           (select count(*)::int from public.agents a where a.hall_id = h.id and a.last_heartbeat_at > now() - interval '5 minutes'),
           (select count(*)::int from public.agents a where a.hall_id = h.id and a.last_heartbeat_at is null),
           (select count(*)::int from public.agent_commands c where c.hall_id = h.id
              and c.status in ('Failed', 'TimedOut') and c.created_at > now() - interval '24 hours'),
           (select count(*)::int from public.agent_commands c where c.hall_id = h.id and c.status in ('Queued', 'Sent'))
      from public.halls h join public.tenants t on t.id = h.tenant_id
     order by t.name, h.name;
end $$;

create function public.admin_search(p_query text, p_reason text)
returns table (kind text, id uuid, label text, detail text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_q text := btrim(coalesce(p_query, '')); v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.require_super_admin();
  if length(v_q) < 2 or length(v_q) > 100 then perform public.raise_contract_error('VALIDATION', 'query'); end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  -- audit first: a search is recorded even if it returns nothing
  perform public.write_audit(null, 'admin.search', 'search', null, v_reason, null, jsonb_build_object('query', v_q));
  return query
    (select 'tenant'::text, t.id, t.name, t.status from public.tenants t where t.name ilike '%' || v_q || '%' order by t.name limit 20)
    union all
    (select 'hall'::text, h.id, h.name, (select tn.name from public.tenants tn where tn.id = h.tenant_id) || ' · ' || h.status
       from public.halls h where h.name ilike '%' || v_q || '%' order by h.name limit 20)
    union all
    (select 'user'::text, p.id, coalesce(p.display_name, p.email), p.email || ' · ' || p.status
       from public.profiles p where p.email ilike '%' || v_q || '%' or p.display_name ilike '%' || v_q || '%' order by p.email limit 20);
end $$;

create function public.sales_report(p_from timestamptz, p_to timestamptz)
returns table (agent_id uuid, agent_name text, leads_created int, leads_qualified int, onboarding_submitted int, converted int, lost int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_platform_role('sales_admin') then perform public.raise_contract_error('PERMISSION_DENIED'); end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days' then
    perform public.raise_contract_error('VALIDATION', 'period');
  end if;
  -- per agent = the agent the lead is assigned to (else its creator). Status counts are the CURRENT
  -- status of leads created in the period (a pipeline snapshot, not an event history).
  return query
    select p.id, coalesce(p.display_name, p.email),
           count(*)::int,
           (count(*) filter (where l.status = 'qualified'))::int,
           (count(*) filter (where l.status = 'onboarding_submitted'))::int,
           (count(*) filter (where l.status = 'converted'))::int,
           (count(*) filter (where l.status = 'lost'))::int
      from public.sales_leads l
      join public.profiles p on p.id = coalesce(l.assigned_to, l.created_by)
     where l.created_at >= p_from and l.created_at < p_to
     group by p.id, p.display_name, p.email
     order by count(*) desc, p.email;
end $$;

revoke execute on function public.admin_monitoring(), public.admin_search(text, text), public.sales_report(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_monitoring(), public.admin_search(text, text), public.sales_report(timestamptz, timestamptz)
  to authenticated;
