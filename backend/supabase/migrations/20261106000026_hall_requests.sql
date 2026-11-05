-- Hall creation requests: an agent submits a request (owner email + username + password) from a lead.
-- The hall and the owner account are created once EITHER the agent's responsible sales manager
-- OR a super admin approves. The password is stored only as a bcrypt hash and is erased once the
-- request is approved or rejected. The table is reachable only through the RPCs below.

create table public.hall_requests (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid not null references public.sales_leads (id),
  requested_by        uuid not null references public.profiles (id),
  manager_id          uuid references public.profiles (id),
  hall_name           text not null check (length(btrim(hall_name)) between 1 and 120),
  currency            text not null check (currency in ('SYP', 'USD')),
  owner_email         text not null check (length(owner_email) <= 254),
  owner_username      text not null check (owner_username ~ '^[a-z0-9_]{3,20}$'),
  owner_password_hash text,
  status              text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  manager_approved_by uuid references public.profiles (id),
  manager_approved_at timestamptz,
  admin_approved_by   uuid references public.profiles (id),
  admin_approved_at   timestamptz,
  rejected_by         uuid references public.profiles (id),
  rejected_reason     text check (rejected_reason is null or length(rejected_reason) <= 300),
  hall_id             uuid references public.halls (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index hall_requests_one_pending_idx on public.hall_requests (lead_id) where status = 'pending';
create index hall_requests_manager_idx on public.hall_requests (manager_id);
create index hall_requests_requested_by_idx on public.hall_requests (requested_by);

alter table public.hall_requests enable row level security;
revoke all on public.hall_requests from anon, authenticated;

-- Internal: create the login user from an already-hashed password (never exposed to clients).
create function public.create_login_user_hashed(p_email text, p_hash text, p_username text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_id uuid := gen_random_uuid();
begin
  if not public.valid_email(v_email) then perform public.raise_contract_error('VALIDATION', 'email'); end if;
  if v_username !~ '^[a-z0-9_]{3,20}$' then perform public.raise_contract_error('VALIDATION', 'username'); end if;
  if p_hash is null or length(p_hash) < 20 then perform public.raise_contract_error('VALIDATION', 'password'); end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    perform public.raise_contract_error('CONFLICT', 'email_taken');
  end if;
  if exists (select 1 from public.profiles where username = v_username) then
    perform public.raise_contract_error('CONFLICT', 'username_taken');
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    p_hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', coalesce(nullif(btrim(p_display_name), ''), v_username), 'username', v_username),
    now(), now(), '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  return v_id;
end $$;
revoke all on function public.create_login_user_hashed(text, text, text, text) from public, anon, authenticated;

-- Agent (or sales admin) submits the request from a lead.
create function public.submit_hall_request(
  p_lead_id uuid, p_hall_name text, p_currency text, p_owner_email text, p_owner_username text, p_owner_password text
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_l public.sales_leads; v_id uuid; v_agent uuid; v_mgr uuid;
  v_email text := lower(btrim(coalesce(p_owner_email, '')));
  v_user text := lower(btrim(coalesce(p_owner_username, '')));
  v_name text := btrim(coalesce(p_hall_name, ''));
  v_cur text := upper(btrim(coalesce(p_currency, '')));
begin
  perform public.require_sales_user();
  select * into v_l from public.sales_leads where id = p_lead_id for update;
  if not found or not public.can_see_lead(v_l.created_by, v_l.assigned_to) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_l.status = 'converted' then perform public.raise_contract_error('PRECONDITION_FAILED', 'converted'); end if;
  if exists (select 1 from public.hall_requests where lead_id = p_lead_id and status = 'pending') then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'already_submitted');
  end if;
  if length(v_name) not between 1 and 120 then perform public.raise_contract_error('VALIDATION', 'hall_name'); end if;
  if v_cur not in ('SYP', 'USD') then perform public.raise_contract_error('VALIDATION', 'currency'); end if;
  if not public.valid_email(v_email) then perform public.raise_contract_error('VALIDATION', 'email'); end if;
  if v_user !~ '^[a-z0-9_]{3,20}$' then perform public.raise_contract_error('VALIDATION', 'username'); end if;
  if p_owner_password is null or length(p_owner_password) < 8 or length(p_owner_password) > 72 then
    perform public.raise_contract_error('VALIDATION', 'password');
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    perform public.raise_contract_error('CONFLICT', 'email_taken');
  end if;
  if exists (select 1 from public.profiles where username = v_user)
     or exists (select 1 from public.hall_requests where status = 'pending' and owner_username = v_user) then
    perform public.raise_contract_error('CONFLICT', 'username_taken');
  end if;

  v_agent := coalesce(v_l.assigned_to, v_l.created_by);
  select responsible_id into v_mgr from public.profiles where id = v_agent;

  insert into public.hall_requests (lead_id, requested_by, manager_id, hall_name, currency, owner_email, owner_username, owner_password_hash)
  values (p_lead_id, auth.uid(), v_mgr, v_name, v_cur, v_email, v_user, crypt(p_owner_password, gen_salt('bf')))
  returning id into v_id;

  update public.sales_leads
     set status = 'onboarding_submitted', updated_at = now(),
         onboarding = jsonb_build_object('business_name', v_l.business_name, 'hall_name', v_name,
                        'time_zone', 'Asia/Damascus', 'currency', v_cur, 'owner_email', v_email)
   where id = p_lead_id;
  perform public.write_audit(null, 'sales.hall_request.submit', 'lead', p_lead_id::text, null, null,
    jsonb_build_object('request_id', v_id, 'hall_name', v_name, 'owner_email', v_email));
  return v_id;
end $$;

-- Approve as the responsible sales manager or as a super admin. The hall is created on the first approval.
create function public.approve_hall_request(p_request_id uuid, p_key uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_r public.hall_requests; v_l public.sales_leads; v_is_admin boolean; v_is_mgr boolean;
  v_owner uuid; v_hall uuid; v_agent uuid;
begin
  v_is_admin := public.has_platform_role('super_admin');
  select * into v_r from public.hall_requests where id = p_request_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  v_is_mgr := (v_r.manager_id is not null and v_r.manager_id = auth.uid())
           or (v_r.manager_id is null and public.has_platform_role('sales_admin'));
  if not (v_is_admin or v_is_mgr) then perform public.raise_contract_error('PERMISSION_DENIED'); end if;
  if v_r.status <> 'pending' then perform public.raise_contract_error('PRECONDITION_FAILED', 'not_pending'); end if;

  if v_is_mgr and v_r.manager_approved_at is null then
    v_r.manager_approved_by := auth.uid(); v_r.manager_approved_at := now();
  end if;
  if v_is_admin and v_r.admin_approved_at is null then
    v_r.admin_approved_by := auth.uid(); v_r.admin_approved_at := now();
  end if;
  update public.hall_requests
     set manager_approved_by = v_r.manager_approved_by, manager_approved_at = v_r.manager_approved_at,
         admin_approved_by = v_r.admin_approved_by, admin_approved_at = v_r.admin_approved_at, updated_at = now()
   where id = p_request_id;
  perform public.write_audit(null, 'sales.hall_request.approve', 'hall_request', p_request_id::text, null, null,
    jsonb_build_object('as_manager', v_is_mgr, 'as_admin', v_is_admin));

  -- One approval is enough: either the responsible sales manager or a super admin.
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
  select * into v_l from public.sales_leads where id = v_r.lead_id for update;
  v_owner := public.create_login_user_hashed(v_r.owner_email, v_r.owner_password_hash, v_r.owner_username, v_r.hall_name);
  v_hall := public.provision_hall(v_r.hall_name, 'Asia/Damascus', v_r.currency, p_key);
  insert into public.hall_memberships (hall_id, user_id, role_key, status) values (v_hall, v_owner, 'owner', 'active');
  v_agent := coalesce(v_l.assigned_to, v_l.created_by);
  insert into public.sales_attributions (lead_id, hall_id, agent_id) values (v_r.lead_id, v_hall, v_agent)
    on conflict (lead_id) do nothing;
  update public.sales_leads set status = 'converted', converted_hall_id = v_hall, updated_at = now() where id = v_r.lead_id;
  update public.hall_requests set status = 'approved', hall_id = v_hall, owner_password_hash = null, updated_at = now()
   where id = p_request_id;
  perform public.write_audit(v_hall, 'sales.hall_request.activate', 'hall_request', p_request_id::text, null, null,
    jsonb_build_object('hall_id', v_hall, 'owner_id', v_owner, 'agent_id', v_agent));
  return jsonb_build_object('status', 'approved', 'hall_id', v_hall);
end $$;

create function public.reject_hall_request(p_request_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_r public.hall_requests; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_r from public.hall_requests where id = p_request_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if not (public.has_platform_role('super_admin')
          or (v_r.manager_id is not null and v_r.manager_id = auth.uid())
          or (v_r.manager_id is null and public.has_platform_role('sales_admin'))) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_r.status <> 'pending' then perform public.raise_contract_error('PRECONDITION_FAILED', 'not_pending'); end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  update public.hall_requests
     set status = 'rejected', rejected_by = auth.uid(), rejected_reason = v_reason, owner_password_hash = null, updated_at = now()
   where id = p_request_id;
  update public.sales_leads set status = 'qualified', onboarding = null, updated_at = now()
   where id = v_r.lead_id and status = 'onboarding_submitted';
  perform public.write_audit(null, 'sales.hall_request.reject', 'hall_request', p_request_id::text, null, null,
    jsonb_build_object('reason', v_reason));
end $$;

create function public.list_hall_requests(p_status text default null, p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, lead_id uuid, business_name text, hall_name text, currency text, owner_email text, owner_username text,
  requested_by_name text, manager_name text, status text,
  manager_approved_at timestamptz, admin_approved_at timestamptz, rejected_reason text, hall_id uuid,
  can_act boolean, created_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_admin boolean := public.has_platform_role('super_admin'); v_sales_admin boolean := public.has_platform_role('sales_admin');
begin
  if not (v_admin or public.has_platform_role('sales_agent') or v_sales_admin) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select r.id, r.lead_id, l.business_name, r.hall_name, r.currency, r.owner_email, r.owner_username,
           coalesce(pr.display_name, pr.email), coalesce(pm.display_name, pm.email), r.status,
           r.manager_approved_at, r.admin_approved_at, r.rejected_reason, r.hall_id,
           r.status = 'pending' and (
             v_admin
             or (r.manager_id is not null and r.manager_id = auth.uid())
             or (r.manager_id is null and v_sales_admin)),
           r.created_at, count(*) over ()
      from public.hall_requests r
      join public.sales_leads l on l.id = r.lead_id
      left join public.profiles pr on pr.id = r.requested_by
      left join public.profiles pm on pm.id = r.manager_id
     where (v_admin or r.requested_by = auth.uid() or r.manager_id = auth.uid() or (r.manager_id is null and v_sales_admin))
       and (p_status is null or r.status = p_status)
     order by (r.status = 'pending') desc, r.created_at desc, r.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

revoke all on function public.submit_hall_request(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.approve_hall_request(uuid, uuid) from public, anon;
revoke all on function public.reject_hall_request(uuid, text) from public, anon;
revoke all on function public.list_hall_requests(text, integer, integer) from public, anon;
grant execute on function public.submit_hall_request(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.approve_hall_request(uuid, uuid) to authenticated;
grant execute on function public.reject_hall_request(uuid, text) to authenticated;
grant execute on function public.list_hall_requests(text, integer, integer) to authenticated;
