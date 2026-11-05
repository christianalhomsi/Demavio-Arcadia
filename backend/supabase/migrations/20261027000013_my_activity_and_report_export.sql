-- W9 leftovers: employee "my activity" (EMP-005) and audited report export (ACC-009).
--
--  * list_my_activity: the caller's OWN audit entries in a hall they are an active member of. Self-filtered
--    on the server (actor = auth.uid()), so an employee cannot see anyone else's actions.
--  * record_report_export: writes an audit entry each time a report is exported. The CSV itself is built
--    by the web server from report_financial_summary (same permission), so the file always equals what the
--    screen shows; this function only makes the export traceable.

create function public.list_my_activity(p_hall_id uuid, p_limit int default 25, p_offset int default 0)
returns table (id uuid, created_at timestamptz, action text, target_type text, target_id text, reason text, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_hall_member(p_hall_id) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select a.id, a.created_at, a.action, a.target_type, a.target_id, a.reason, count(*) over ()
      from public.audit_logs a
     where a.hall_id = p_hall_id and a.actor_id = auth.uid()
     order by a.created_at desc, a.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.record_report_export(p_hall_id uuid, p_report text, p_from timestamptz, p_to timestamptz) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'report.financial.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_report not in ('financial_summary') then perform public.raise_contract_error('VALIDATION', 'report'); end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days' then
    perform public.raise_contract_error('VALIDATION', 'period');
  end if;
  perform public.write_audit(p_hall_id, 'report.export', 'report', p_report, null, null,
    jsonb_build_object('format', 'csv', 'from', p_from, 'to', p_to));
end $$;

revoke execute on function public.list_my_activity(uuid, int, int), public.record_report_export(uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.list_my_activity(uuid, int, int), public.record_report_export(uuid, text, timestamptz, timestamptz)
  to authenticated;
