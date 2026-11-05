-- Super admin: who sold each hall, who is on the sales team, and creating sales accounts directly (DEC-P23).
--
--  * `profiles.responsible_id` records who is responsible for a sales account (the super admin who
--    created it, or a sales admin they choose).
--  * `admin_create_sales_account` creates a sign-in (email + password) for a sales agent or sales admin
--    and gives it the platform role. The password is hashed inside the database and is never stored in
--    the audit trail or returned.
--  * `admin_list_halls_sold` and `admin_list_sales_team` feed the new "Sales" page.

set local search_path = public, extensions;

alter table public.profiles add column responsible_id uuid references public.profiles (id);
create index profiles_responsible_idx on public.profiles (responsible_id) where responsible_id is not null;

create function public.admin_create_sales_account(
  p_email text, p_password text, p_username text, p_display_name text, p_role text, p_responsible uuid
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_resp uuid := coalesce(p_responsible, auth.uid());
  v_id uuid := gen_random_uuid();
begin
  perform public.require_super_admin();
  if p_role is null or p_role not in ('sales_agent', 'sales_admin') then
    perform public.raise_contract_error('VALIDATION', 'role');
  end if;
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
  if not exists (
    select 1 from public.profiles p join public.user_role_assignments a on a.user_id = p.id
     where p.id = v_resp and p.status = 'active' and a.role_key in ('super_admin', 'sales_admin')
  ) then
    perform public.raise_contract_error('NOT_FOUND', 'responsible');
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

  update public.profiles set responsible_id = v_resp where id = v_id;
  insert into public.user_role_assignments (user_id, role_key) values (v_id, p_role);
  perform public.write_audit(null, 'admin.user.create_sales', 'user', v_id::text, null, null,
    jsonb_build_object('email', v_email, 'role', p_role, 'responsible_id', v_resp));
  return v_id;
end $$;

-- Every hall with the sales person who brought it in (null = created directly by a super admin).
create function public.admin_list_halls_sold(p_search text default null, p_limit int default 25, p_offset int default 0)
returns table (hall_id uuid, hall_name text, hall_status text, tenant_id uuid, tenant_name text,
               sold_by_id uuid, sold_by_name text, sold_by_email text, sold_at timestamptz,
               attribution_status text, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select h.id, h.name, h.status, t.id, t.name,
           s.agent_id, coalesce(p.display_name, p.email), p.email, s.created_at, s.status, count(*) over ()
      from public.halls h
      join public.tenants t on t.id = h.tenant_id
      left join public.sales_attributions s on s.tenant_id = t.id
      left join public.profiles p on p.id = s.agent_id
     where p_search is null or h.name ilike '%' || p_search || '%' or t.name ilike '%' || p_search || '%'
        or p.email ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%'
     order by h.created_at desc, h.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- Sales agents and sales admins, who is responsible for each, and how many halls they brought in.
create function public.admin_list_sales_team()
returns table (user_id uuid, display_name text, email text, username text, role_key text, status text,
               responsible_id uuid, responsible_name text, halls_sold int, leads_count int, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select p.id, p.display_name, p.email, p.username, a.role_key, p.status,
           p.responsible_id, coalesce(r.display_name, r.email),
           (select count(*)::int from public.sales_attributions s where s.agent_id = p.id),
           (select count(*)::int from public.sales_leads l where l.assigned_to = p.id or l.created_by = p.id),
           p.created_at
      from public.user_role_assignments a
      join public.profiles p on p.id = a.user_id
      left join public.profiles r on r.id = p.responsible_id
     where a.role_key in ('sales_agent', 'sales_admin')
     order by a.role_key, p.display_name nulls last, p.email;
end $$;

revoke execute on function
  public.admin_create_sales_account(text, text, text, text, text, uuid),
  public.admin_list_halls_sold(text, int, int),
  public.admin_list_sales_team()
  from public, anon, authenticated;
grant execute on function
  public.admin_create_sales_account(text, text, text, text, text, uuid),
  public.admin_list_halls_sold(text, int, int),
  public.admin_list_sales_team()
  to authenticated;
