-- Super admin can permanently delete a hall (with everything in it) or an account (DEC-P25).
--
-- Deleting is irreversible and is the one place the append-only rules are lifted on purpose:
--  * `admin_delete_hall` removes the hall, ALL of its data (sessions, invoices, payments, wallets,
--    audit entries, ...), its hidden tenant row and the accounts that only belonged to that hall.
--  * `admin_delete_user` removes one account. Owners must have their hall deleted first. An account that is
--    still named on required records in a hall cannot be removed (deactivate it instead).
-- Both leave one audit entry that is not tied to the deleted hall, so the deletion itself stays recorded.
--
-- Foreign keys are made deferrable so rows can be removed in any order inside one transaction, and the
-- append-only triggers of the affected tables are switched off only for the duration of that transaction.

set local search_path = public, extensions;

-- Internal: every foreign key in public becomes DEFERRABLE (still checked immediately unless deferred).
create function public.make_fks_deferrable() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
      from pg_constraint c
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace and not c.condeferrable
  loop
    execute format('alter table %s alter constraint %I deferrable initially immediate', r.tbl, r.conname);
  end loop;
end $$;

-- Internal: removes one account. Raises has_history when a required record still names it.
create function public.purge_user(p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_blocked boolean;
begin
  for r in
    select c.conrelid::regclass as tbl, att.attname as col, att.attnotnull as not_null
      from pg_constraint c
      join pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
       and c.confdeltype <> 'c' and cardinality(c.conkey) = 1
  loop
    if r.not_null then
      execute format('select exists (select 1 from %s where %I = $1)', r.tbl, r.col) into v_blocked using p_user;
      if v_blocked then perform public.raise_contract_error('PRECONDITION_FAILED', 'has_history'); end if;
    end if;
  end loop;

  for r in
    select c.conrelid::regclass as tbl, att.attname as col
      from pg_constraint c
      join pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
       and c.confdeltype <> 'c' and cardinality(c.conkey) = 1 and not att.attnotnull
  loop
    execute format('alter table %s disable trigger user', r.tbl);
    execute format('update %s set %I = null where %I = $1', r.tbl, r.col, r.col) using p_user;
    execute format('alter table %s enable trigger user', r.tbl);
  end loop;

  delete from auth.users where id = p_user;
end $$;

create function public.admin_delete_user(p_user_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_p public.profiles; v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.require_super_admin();
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  select * into v_p from public.profiles where id = p_user_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if p_user_id = auth.uid() then perform public.raise_contract_error('PRECONDITION_FAILED', 'self_delete'); end if;
  if exists (select 1 from public.user_role_assignments where user_id = p_user_id and role_key = 'super_admin')
     and (select count(*) from public.user_role_assignments a join public.profiles p on p.id = a.user_id
           where a.role_key = 'super_admin' and p.status = 'active' and a.user_id <> p_user_id) = 0 then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'last_super_admin');
  end if;
  if exists (select 1 from public.hall_memberships where user_id = p_user_id and role_key = 'owner') then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'owns_hall');
  end if;

  perform public.purge_user(p_user_id);
  perform public.write_audit(null, 'admin.user.delete', 'user', p_user_id::text, v_reason,
    jsonb_build_object('email', v_p.email, 'username', v_p.username, 'display_name', v_p.display_name), null);
end $$;

create function public.admin_delete_hall(p_hall_id uuid, p_reason text) returns jsonb
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

  -- Accounts that belong only to this hall: members with no other hall and no platform role.
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

  -- The hidden tenant goes with its last hall, together with the sales credit tied to it.
  if not exists (select 1 from public.halls where tenant_id = v_h.tenant_id) then
    delete from public.sales_attributions where tenant_id = v_h.tenant_id;
    update public.sales_leads set tenant_id = null where tenant_id = v_h.tenant_id;
    delete from public.tenants where id = v_h.tenant_id;
  end if;

  -- Pending constraint checks must run before the triggers can be switched back on.
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

revoke execute on function
  public.make_fks_deferrable(), public.purge_user(uuid),
  public.admin_delete_user(uuid, text), public.admin_delete_hall(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_delete_user(uuid, text), public.admin_delete_hall(uuid, text) to authenticated;
