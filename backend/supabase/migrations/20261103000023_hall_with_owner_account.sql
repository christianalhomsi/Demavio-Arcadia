-- One hall per account, created by a super admin with the owner's email and password (DEC-P24).
--
--  * There is no "business" in the product: a hall is the customer. `admin_create_hall_with_owner`
--    creates the hall (always Asia/Damascus, in SYP or USD) together with its owner's sign-in. A hidden
--    tenant row named after the hall keeps the existing hall -> tenant structure intact.
--  * The time zone of a hall can no longer be changed from its settings.
--  * `create_login_user` is the one internal place that creates an email + password sign-in; the sales
--    account function now uses it too.
--  * `admin_list_halls_sold` also returns the owner and currency, for the halls page.

set local search_path = public, extensions;

create function public.create_login_user(
  p_email text, p_password text, p_username text, p_display_name text
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_id uuid := gen_random_uuid();
begin
  if not public.valid_email(v_email) then perform public.raise_contract_error('VALIDATION', 'email'); end if;
  if p_password is null or length(p_password) < 8 or length(p_password) > 72 then
    perform public.raise_contract_error('VALIDATION', 'password');
  end if;
  if v_username !~ '^[a-z0-9_]{3,20}$' then perform public.raise_contract_error('VALIDATION', 'username'); end if;
  if v_name is not null and length(v_name) > 120 then perform public.raise_contract_error('VALIDATION', 'name'); end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    perform public.raise_contract_error('CONFLICT', 'email_taken');
  end if;
  if exists (select 1 from public.profiles where username = v_username) then
    perform public.raise_contract_error('CONFLICT', 'username_taken');
  end if;

  -- The profile row is created by the handle_new_user trigger from the metadata below.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', coalesce(v_name, v_username), 'username', v_username),
    now(), now(), '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  return v_id;
end $$;

revoke execute on function public.create_login_user(text, text, text, text) from public, anon, authenticated;

create or replace function public.admin_create_sales_account(
  p_email text, p_password text, p_username text, p_display_name text, p_role text, p_responsible uuid
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_resp uuid := coalesce(p_responsible, auth.uid());
  v_id uuid;
begin
  perform public.require_super_admin();
  if p_role is null or p_role not in ('sales_agent', 'sales_admin') then
    perform public.raise_contract_error('VALIDATION', 'role');
  end if;
  if not exists (
    select 1 from public.profiles p join public.user_role_assignments a on a.user_id = p.id
     where p.id = v_resp and p.status = 'active' and a.role_key in ('super_admin', 'sales_admin')
  ) then
    perform public.raise_contract_error('NOT_FOUND', 'responsible');
  end if;

  v_id := public.create_login_user(p_email, p_password, p_username, p_display_name);
  update public.profiles set responsible_id = v_resp where id = v_id;
  insert into public.user_role_assignments (user_id, role_key) values (v_id, p_role);
  perform public.write_audit(null, 'admin.user.create_sales', 'user', v_id::text, null, null,
    jsonb_build_object('email', lower(btrim(p_email)), 'role', p_role, 'responsible_id', v_resp));
  return v_id;
end $$;

-- Retry-safe: the same key returns the hall that was already created.
create function public.admin_create_hall_with_owner(
  p_hall_name text, p_currency text, p_email text, p_password text, p_username text, p_key uuid
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_hall uuid;
  v_tenant uuid;
  v_owner uuid;
  v_name text := btrim(coalesce(p_hall_name, ''));
  v_currency text := upper(btrim(coalesce(p_currency, '')));
begin
  perform public.require_super_admin();
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
  select id into v_hall from public.halls where created_by = auth.uid() and create_key = p_key;
  if found then return v_hall; end if;

  if length(v_name) = 0 or length(v_name) > 120 then perform public.raise_contract_error('VALIDATION', 'name'); end if;
  if v_currency not in ('SYP', 'USD') then perform public.raise_contract_error('VALIDATION', 'currency'); end if;

  -- Creates the sign-in first: it validates the email, password and username and may refuse.
  v_owner := public.create_login_user(p_email, p_password, p_username, v_name);

  insert into public.tenants (name, created_by, create_key) values (v_name, auth.uid(), p_key)
  returning id into v_tenant;
  v_hall := public.provision_hall(v_tenant, v_name, 'Asia/Damascus', v_currency, p_key);
  insert into public.hall_memberships (hall_id, user_id, role_key, status) values (v_hall, v_owner, 'owner', 'active');
  perform public.write_audit(v_hall, 'admin.hall.create_with_owner', 'hall', v_hall::text, null, null,
    jsonb_build_object('owner_id', v_owner, 'owner_email', lower(btrim(p_email))));
  return v_hall;
end $$;

-- A hall's time zone is fixed (Asia/Damascus): the profile can still be edited, but not the zone.
create or replace function public.update_hall_profile(
  p_hall_id uuid, p_name text, p_address text, p_contact_phone text, p_time_zone text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before jsonb;
begin
  if not public.has_hall_permission(p_hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 120 then
    perform public.raise_contract_error('VALIDATION', 'name');
  end if;

  select jsonb_build_object('name', name, 'address', address, 'contact_phone', contact_phone, 'time_zone', time_zone)
    into v_before from public.halls where id = p_hall_id for update;
  if p_time_zone is distinct from v_before ->> 'time_zone' then
    perform public.raise_contract_error('VALIDATION', 'time_zone_locked');
  end if;

  update public.halls
     set name = btrim(p_name), address = nullif(btrim(p_address), ''),
         contact_phone = nullif(btrim(p_contact_phone), '')
   where id = p_hall_id;

  perform public.write_audit(p_hall_id, 'hall.profile.update', 'hall', p_hall_id::text, null, v_before,
    jsonb_build_object('name', btrim(p_name), 'address', nullif(btrim(p_address), ''),
                       'contact_phone', nullif(btrim(p_contact_phone), ''), 'time_zone', p_time_zone));
end $$;

drop function public.admin_list_halls_sold(text, int, int);
create function public.admin_list_halls_sold(p_search text default null, p_limit int default 25, p_offset int default 0)
returns table (hall_id uuid, hall_name text, hall_status text, currency text, tenant_id uuid, tenant_name text,
               owner_email text, owner_username text,
               sold_by_id uuid, sold_by_name text, sold_by_email text, sold_at timestamptz,
               attribution_status text, created_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select h.id, h.name, h.status, h.currency::text, t.id, t.name,
           o.email, o.username,
           s.agent_id, coalesce(p.display_name, p.email), p.email, s.created_at, s.status, h.created_at, count(*) over ()
      from public.halls h
      join public.tenants t on t.id = h.tenant_id
      left join lateral (
        select pr.email, pr.username from public.hall_memberships m join public.profiles pr on pr.id = m.user_id
         where m.hall_id = h.id and m.role_key = 'owner' and m.status = 'active' order by m.created_at limit 1
      ) o on true
      left join public.sales_attributions s on s.tenant_id = t.id
      left join public.profiles p on p.id = s.agent_id
     where p_search is null or h.name ilike '%' || p_search || '%' or t.name ilike '%' || p_search || '%'
        or o.email ilike '%' || p_search || '%'
        or p.email ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%'
     order by h.created_at desc, h.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

revoke execute on function
  public.admin_create_hall_with_owner(text, text, text, text, text, uuid),
  public.admin_list_halls_sold(text, int, int)
  from public, anon, authenticated;
grant execute on function
  public.admin_create_hall_with_owner(text, text, text, text, text, uuid),
  public.admin_list_halls_sold(text, int, int)
  to authenticated;
