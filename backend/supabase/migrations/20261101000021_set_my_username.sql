-- Everyone needs a username, including people who sign in with Google (DEC-P21, owner request).
--
--  * `get_my_context` now returns the username, so the web can send anyone without one to a "choose a
--    username" page before they use the app.
--  * `set_my_username` lets a signed-in person choose their username ONCE. It must be unique and must
--    not simply be their Google name or the first part of their email: it is meant to be a separate,
--    chosen name. Changing it later is not allowed (it needs an owner/admin decision, so it is left out).

set local search_path = public, extensions;

create or replace function public.get_my_context() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_result jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    return null;
  end if;

  v_result := jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'display_name', v_profile.display_name,
      'email', v_profile.email,
      'status', v_profile.status,
      'avatar_url', v_profile.avatar_url,
      'username', v_profile.username
    ),
    'platform_roles', '[]'::jsonb,
    'memberships', '[]'::jsonb
  );

  -- Inactive profiles get no roles or memberships at all.
  if v_profile.status <> 'active' then
    return v_result;
  end if;

  v_result := jsonb_set(
    v_result, '{platform_roles}',
    coalesce(
      (select jsonb_agg(a.role_key order by a.role_key)
         from public.user_role_assignments a where a.user_id = v_uid),
      '[]'::jsonb
    )
  );

  v_result := jsonb_set(
    v_result, '{memberships}',
    coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'hall_id', h.id,
           'hall_name', h.name,
           'tenant_id', h.tenant_id,
           -- A hall is effectively inactive if its tenant is deactivated.
           'hall_status', case when h.status = 'active' and t.status = 'active'
                               then 'active' else 'inactive' end,
           'role', m.role_key,
           'permissions', case when h.status = 'active' and t.status = 'active'
                               then to_jsonb(public.membership_permissions(m.id))
                               else '[]'::jsonb end,
           'discount_limit_minor', m.discount_limit_minor
         ) order by h.name
       )
       from public.hall_memberships m
       join public.halls h on h.id = m.hall_id
       join public.tenants t on t.id = h.tenant_id
       where m.user_id = v_uid and m.status = 'active'),
      '[]'::jsonb
    )
  );

  return v_result;
end $$;

create function public.set_my_username(p_username text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p public.profiles;
  v_name text := lower(btrim(coalesce(p_username, '')));
  v_account text;
begin
  select * into v_p from public.profiles where id = auth.uid() for update;
  if not found or v_p.status <> 'active' then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_p.username is not null then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'username_set');
  end if;
  if v_name !~ '^[a-z0-9_]{3,20}$' then
    perform public.raise_contract_error('VALIDATION', 'username');
  end if;

  -- Not just the Google name or the email's first part: compare with spaces and punctuation removed.
  foreach v_account in array array[
    regexp_replace(lower(coalesce(v_p.display_name, '')), '[^a-z0-9]', '', 'g'),
    regexp_replace(lower(split_part(coalesce(v_p.email, ''), '@', 1)), '[^a-z0-9]', '', 'g')
  ] loop
    if v_account <> '' and v_account = regexp_replace(v_name, '[^a-z0-9]', '', 'g') then
      perform public.raise_contract_error('VALIDATION', 'username_same_as_account');
    end if;
  end loop;

  begin
    update public.profiles set username = v_name where id = v_p.id;
  exception when unique_violation then
    perform public.raise_contract_error('CONFLICT', 'username_taken');
  end;
end $$;

revoke execute on function public.get_my_context(), public.set_my_username(text) from public, anon, authenticated;
grant execute on function public.get_my_context(), public.set_my_username(text) to authenticated;
