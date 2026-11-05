-- Stop recording low-value activity in the audit log.
--
-- Every audit entry goes through write_audit, so the list of actions that are no longer recorded lives
-- here in one place. To record one again, remove it from the array. Rows already written stay as they are
-- (the log is append-only); this only affects new activity.
--
-- Not recorded any more:
--   session.item.add / session.item.remove   products on a session are already visible on its invoice
--   device.command.request                   remote device commands are kept in the device command log
--   admin.hall.create / admin.hall.create_with_owner   who created a hall

create or replace function public.write_audit(
  p_hall_id uuid, p_action text, p_target_type text, p_target_id text,
  p_reason text, p_before jsonb, p_after jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_action = any (array[
    'session.item.add', 'session.item.remove',
    'device.command.request',
    'admin.hall.create', 'admin.hall.create_with_owner'
  ]) then
    return;
  end if;
  insert into public.audit_logs (actor_id, hall_id, action, target_type, target_id, reason, before_data, after_data)
  values (auth.uid(), p_hall_id, p_action, p_target_type, p_target_id, p_reason, p_before, p_after);
end $$;
