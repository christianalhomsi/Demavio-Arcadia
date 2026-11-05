-- Platform administration and sales (web phase W10; spec §4.4-4.6, §6.3, §21.3).
--
-- PROVISIONAL decisions (see WEB_RISKS_AND_DECISIONS.md):
--  * DEC-17: tenant -> many halls (a hall acts as a branch). A tenant gets its first owner through a
--    hall invitation created by a super admin (the existing accept_invitation flow, token shown once).
--  * DEC-16: sales submit an onboarding REQUEST on a lead; they never create halls. A super admin reviews
--    it and converts it (tenant + hall + owner invitation + attribution to the lead's agent).
--  * Super admin has NO hall financial permissions; these RPCs touch only platform data and never
--    expose invoices, payments, wallets, registers or reports (spec §4.4, §4.5).
--  * Sales admin may manage sales agents (assign/revoke the sales_agent role) and resolve attribution
--    disputes; only a super admin manages super_admin / sales_admin roles and user status.
--  * Every change is audited with hall_id = null (platform audit) or the affected hall.
--
-- Clients read nothing from these tables directly except through RLS-limited SELECT policies; all
-- writes go through SECURITY DEFINER functions with a fixed search_path.

-- ---------------------------------------------------------------------------
-- Tenant / hall provisioning columns (idempotency + provenance)
-- ---------------------------------------------------------------------------

alter table public.tenants
  add column created_by uuid references public.profiles (id),
  add column create_key uuid,
  add column status_reason text,
  add column status_changed_at timestamptz;
create unique index tenants_create_key_idx on public.tenants (created_by, create_key) where create_key is not null;
create unique index tenants_name_idx on public.tenants (lower(btrim(name)));

alter table public.halls
  add column created_by uuid references public.profiles (id),
  add column create_key uuid;
create unique index halls_create_key_idx on public.halls (created_by, create_key) where create_key is not null;

-- ---------------------------------------------------------------------------
-- Sales tables
-- ---------------------------------------------------------------------------

create table public.sales_leads (
  id              uuid primary key default gen_random_uuid(),
  business_name   text not null check (length(btrim(business_name)) between 1 and 120),
  contact_name    text check (contact_name is null or length(contact_name) <= 120),
  contact_email   text check (contact_email is null or length(contact_email) <= 254),
  contact_phone   text check (contact_phone is null or length(contact_phone) <= 40),
  city            text check (city is null or length(city) <= 80),
  notes           text check (notes is null or length(notes) <= 1000),
  status          text not null default 'new'
                  check (status in ('new', 'contacted', 'qualified', 'onboarding_submitted', 'converted', 'lost')),
  created_by      uuid not null references public.profiles (id),
  assigned_to     uuid references public.profiles (id),
  onboarding      jsonb,
  tenant_id       uuid references public.tenants (id),
  create_key      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index sales_leads_assigned_idx on public.sales_leads (assigned_to);
create index sales_leads_created_idx on public.sales_leads (created_by);
create unique index sales_leads_create_key_idx on public.sales_leads (created_by, create_key) where create_key is not null;

create table public.sales_attributions (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references public.sales_leads (id),
  tenant_id        uuid not null references public.tenants (id),
  agent_id         uuid not null references public.profiles (id),
  status           text not null default 'active' check (status in ('active', 'disputed', 'resolved')),
  dispute_reason   text check (dispute_reason is null or length(dispute_reason) <= 300),
  disputed_by      uuid references public.profiles (id),
  resolution_note  text check (resolution_note is null or length(resolution_note) <= 300),
  resolved_by      uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  unique (lead_id)
);
create index sales_attributions_agent_idx on public.sales_attributions (agent_id);

alter table public.sales_leads        enable row level security;
alter table public.sales_attributions enable row level security;

-- Own/assigned leads for agents, all for sales admins. Super admin sees none of this by role alone.
create function public.can_see_lead(p_created_by uuid, p_assigned_to uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.has_platform_role('sales_admin')
      or (public.has_platform_role('sales_agent') and (p_created_by = auth.uid() or p_assigned_to = auth.uid()));
$$;

create policy sales_leads_select on public.sales_leads
  for select to authenticated using (public.can_see_lead(created_by, assigned_to));
create policy sales_attributions_select on public.sales_attributions
  for select to authenticated using (
    public.has_platform_role('sales_admin') or (public.has_platform_role('sales_agent') and agent_id = auth.uid()));

revoke all on public.sales_leads, public.sales_attributions from anon, authenticated;
grant select on public.sales_leads, public.sales_attributions to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create function public.require_super_admin() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_platform_role('super_admin') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
end $$;

create function public.require_sales_user() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (public.has_platform_role('sales_admin') or public.has_platform_role('sales_agent')) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
end $$;

create function public.valid_email(p text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(p) <= 254;
$$;

-- Creates one hall (+ default settings/register via triggers). Shared by admin_create_hall and conversion.
create function public.provision_hall(p_tenant uuid, p_name text, p_tz text, p_currency text, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 120 then
    perform public.raise_contract_error('VALIDATION', 'name');
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_tz) then
    perform public.raise_contract_error('VALIDATION', 'time_zone');
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    perform public.raise_contract_error('VALIDATION', 'currency');
  end if;
  insert into public.halls (tenant_id, name, time_zone, currency, created_by, create_key)
  values (p_tenant, btrim(p_name), p_tz, p_currency, auth.uid(), p_key) returning id into v_id;
  perform public.write_audit(v_id, 'admin.hall.create', 'hall', v_id::text, null, null,
    jsonb_build_object('tenant_id', p_tenant, 'name', btrim(p_name), 'time_zone', p_tz, 'currency', p_currency));
  return v_id;
end $$;

create function public.provision_owner_invitation(p_hall uuid, p_email text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_token text; v_id uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.valid_email(v_email) then perform public.raise_contract_error('VALIDATION', 'email'); end if;
  if exists (select 1 from public.hall_invitations
              where hall_id = p_hall and lower(email) = v_email and status = 'pending' and expires_at > now()) then
    perform public.raise_contract_error('CONFLICT', 'already_invited');
  end if;
  update public.hall_invitations set status = 'revoked'
   where hall_id = p_hall and lower(email) = v_email and status = 'pending' and expires_at <= now();
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.hall_invitations (hall_id, email, role_key, token_hash, invited_by)
  values (p_hall, v_email, 'owner', encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), auth.uid())
  returning id into v_id;
  perform public.write_audit(p_hall, 'admin.owner.invite', 'invitation', v_id::text, null, null,
    jsonb_build_object('email', v_email));
  return v_token;
end $$;

-- ---------------------------------------------------------------------------
-- Platform administration (super admin only)
-- ---------------------------------------------------------------------------

create function public.admin_platform_metrics()
returns table (tenants_total int, tenants_active int, halls_total int, users_total int,
               leads_open int, onboarding_pending int, agents_total int, agents_recent int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query select
    (select count(*)::int from public.tenants),
    (select count(*)::int from public.tenants where status = 'active'),
    (select count(*)::int from public.halls),
    (select count(*)::int from public.profiles),
    (select count(*)::int from public.sales_leads where status not in ('converted', 'lost')),
    (select count(*)::int from public.sales_leads where status = 'onboarding_submitted'),
    (select count(*)::int from public.agents),
    -- "recent" = heartbeat within the last 5 minutes (PROVISIONAL threshold)
    (select count(*)::int from public.agents where last_heartbeat_at > now() - interval '5 minutes');
end $$;

create function public.admin_list_tenants(p_search text default null, p_limit int default 25, p_offset int default 0, p_tenant_id uuid default null)
returns table (id uuid, name text, status text, status_reason text, created_at timestamptz,
               halls_count int, owners_count int, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select t.id, t.name, t.status, t.status_reason, t.created_at,
           (select count(*)::int from public.halls h where h.tenant_id = t.id),
           (select count(distinct m.user_id)::int from public.hall_memberships m join public.halls h on h.id = m.hall_id
             where h.tenant_id = t.id and m.role_key = 'owner' and m.status = 'active'),
           count(*) over ()
      from public.tenants t
     where (p_tenant_id is null or t.id = p_tenant_id)
       and (p_search is null or t.name ilike '%' || p_search || '%')
     order by t.created_at desc, t.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.admin_create_tenant(p_name text, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_existing public.tenants; v_id uuid;
begin
  perform public.require_super_admin();
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
  select * into v_existing from public.tenants where created_by = auth.uid() and create_key = p_key;
  if found then
    if v_existing.name <> btrim(coalesce(p_name, '')) then perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch'); end if;
    return v_existing.id;
  end if;
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 120 then
    perform public.raise_contract_error('VALIDATION', 'name');
  end if;
  if exists (select 1 from public.tenants where lower(btrim(name)) = lower(btrim(p_name))) then
    perform public.raise_contract_error('CONFLICT', 'name_taken');
  end if;
  insert into public.tenants (name, created_by, create_key) values (btrim(p_name), auth.uid(), p_key) returning id into v_id;
  perform public.write_audit(null, 'admin.tenant.create', 'tenant', v_id::text, null, null, jsonb_build_object('name', btrim(p_name)));
  return v_id;
end $$;

create function public.admin_list_halls(p_tenant_id uuid)
returns table (id uuid, name text, status text, time_zone text, currency char(3), created_at timestamptz,
               owners text[], pending_owner_invites text[])
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select h.id, h.name, h.status, h.time_zone, h.currency, h.created_at,
           coalesce((select array_agg(coalesce(p.email, p.display_name) order by p.email)
                       from public.hall_memberships m join public.profiles p on p.id = m.user_id
                      where m.hall_id = h.id and m.role_key = 'owner' and m.status = 'active'), '{}'),
           coalesce((select array_agg(i.email order by i.email) from public.hall_invitations i
                      where i.hall_id = h.id and i.role_key = 'owner' and i.status = 'pending' and i.expires_at > now()), '{}')
      from public.halls h where h.tenant_id = p_tenant_id order by h.created_at;
end $$;

create function public.admin_create_hall(p_tenant_id uuid, p_name text, p_time_zone text, p_currency text, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_existing public.halls; v_id uuid;
begin
  perform public.require_super_admin();
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
  select * into v_existing from public.halls where created_by = auth.uid() and create_key = p_key;
  if found then
    if v_existing.tenant_id <> p_tenant_id then perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch'); end if;
    return v_existing.id;
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant_id) then perform public.raise_contract_error('NOT_FOUND'); end if;
  return public.provision_hall(p_tenant_id, p_name, p_time_zone, upper(coalesce(p_currency, '')), p_key);
end $$;

-- Returns the one-time token (only its hash is stored); the web shows it once as an invite link.
create function public.admin_invite_owner(p_hall_id uuid, p_email text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  if not exists (select 1 from public.halls where id = p_hall_id) then perform public.raise_contract_error('NOT_FOUND'); end if;
  return public.provision_owner_invitation(p_hall_id, p_email);
end $$;

create function public.admin_set_tenant_status(p_tenant_id uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_t public.tenants; v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.require_super_admin();
  if p_status not in ('active', 'inactive') then perform public.raise_contract_error('VALIDATION', 'status'); end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  select * into v_t from public.tenants where id = p_tenant_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if v_t.status = p_status then return; end if;      -- retry-safe
  update public.tenants set status = p_status, status_reason = v_reason, status_changed_at = now() where id = p_tenant_id;
  perform public.write_audit(null, 'admin.tenant.status', 'tenant', p_tenant_id::text, v_reason,
    jsonb_build_object('status', v_t.status), jsonb_build_object('status', p_status));
end $$;

create function public.admin_set_hall_status(p_hall_id uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_h public.halls; v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.require_super_admin();
  if p_status not in ('active', 'inactive') then perform public.raise_contract_error('VALIDATION', 'status'); end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  select * into v_h from public.halls where id = p_hall_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if v_h.status = p_status then return; end if;
  update public.halls set status = p_status where id = p_hall_id;
  perform public.write_audit(p_hall_id, 'admin.hall.status', 'hall', p_hall_id::text, v_reason,
    jsonb_build_object('status', v_h.status), jsonb_build_object('status', p_status));
end $$;

create function public.admin_list_users(p_search text default null, p_limit int default 25, p_offset int default 0)
returns table (id uuid, display_name text, email text, status text, platform_roles text[], halls_count int, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select p.id, p.display_name, p.email, p.status,
           coalesce((select array_agg(a.role_key order by a.role_key) from public.user_role_assignments a where a.user_id = p.id), '{}'),
           (select count(*)::int from public.hall_memberships m where m.user_id = p.id and m.status = 'active'),
           count(*) over ()
      from public.profiles p
     where p_search is null or p.email ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%'
     order by p.created_at desc, p.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- Super admin: any platform role. Sales admin: only sales_agent. The target must have signed in once.
create function public.admin_assign_platform_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid;
begin
  if p_role not in ('super_admin', 'sales_admin', 'sales_agent') then perform public.raise_contract_error('VALIDATION', 'role'); end if;
  if not (public.has_platform_role('super_admin') or (p_role = 'sales_agent' and public.has_platform_role('sales_admin'))) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  select id into v_uid from public.profiles where lower(email) = lower(btrim(coalesce(p_email, ''))) and status = 'active';
  if v_uid is null then perform public.raise_contract_error('NOT_FOUND'); end if;
  insert into public.user_role_assignments (user_id, role_key) values (v_uid, p_role) on conflict do nothing;
  if found then
    perform public.write_audit(null, 'admin.role.assign', 'user', v_uid::text, null, null, jsonb_build_object('role', p_role));
  end if;
end $$;

create function public.admin_revoke_platform_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_role not in ('super_admin', 'sales_admin', 'sales_agent') then perform public.raise_contract_error('VALIDATION', 'role'); end if;
  if not (public.has_platform_role('super_admin') or (p_role = 'sales_agent' and public.has_platform_role('sales_admin'))) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_role = 'super_admin' then
    if p_user_id = auth.uid() then perform public.raise_contract_error('PRECONDITION_FAILED', 'cannot_modify_self'); end if;
    if (select count(*) from public.user_role_assignments where role_key = 'super_admin') <= 1 then
      perform public.raise_contract_error('PRECONDITION_FAILED', 'last_super_admin');
    end if;
  end if;
  delete from public.user_role_assignments where user_id = p_user_id and role_key = p_role;
  if found then
    perform public.write_audit(null, 'admin.role.revoke', 'user', p_user_id::text, null, jsonb_build_object('role', p_role), null);
  end if;
end $$;

create function public.admin_set_user_status(p_user_id uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_p public.profiles; v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.require_super_admin();
  if p_status not in ('active', 'inactive') then perform public.raise_contract_error('VALIDATION', 'status'); end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  if p_user_id = auth.uid() then perform public.raise_contract_error('PRECONDITION_FAILED', 'cannot_modify_self'); end if;
  select * into v_p from public.profiles where id = p_user_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if v_p.status = p_status then return; end if;
  update public.profiles set status = p_status where id = p_user_id;
  perform public.write_audit(null, 'admin.user.status', 'user', p_user_id::text, v_reason,
    jsonb_build_object('status', v_p.status), jsonb_build_object('status', p_status));
end $$;

-- Platform audit: entries not tied to a hall (tenant, role, user and sales actions).
create function public.admin_list_audit(p_limit int default 25, p_offset int default 0, p_action text default null)
returns table (id uuid, created_at timestamptz, actor_name text, action text, target_type text, target_id text,
               reason text, before_data jsonb, after_data jsonb, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select a.id, a.created_at, coalesce(p.display_name, p.email), a.action, a.target_type, a.target_id, a.reason,
           a.before_data, a.after_data, count(*) over ()
      from public.audit_logs a left join public.profiles p on p.id = a.actor_id
     where a.hall_id is null and (p_action is null or a.action like p_action || '%')
     order by a.created_at desc, a.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- Submitted onboarding requests awaiting review (super admin cannot read sales_leads directly).
create function public.admin_list_onboarding_requests()
returns table (lead_id uuid, business_name text, agent_name text, onboarding jsonb, submitted_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select l.id, l.business_name, coalesce(p.display_name, p.email), l.onboarding, l.updated_at
      from public.sales_leads l left join public.profiles p on p.id = coalesce(l.assigned_to, l.created_by)
     where l.status = 'onboarding_submitted' order by l.updated_at;
end $$;

-- Reviews an onboarding request and provisions the customer. Retry-safe: converting twice returns the tenant.
create function public.admin_convert_lead(p_lead_id uuid, p_key uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_l public.sales_leads; v_tenant uuid; v_hall uuid; v_agent uuid; v_o jsonb;
begin
  perform public.require_super_admin();
  select * into v_l from public.sales_leads where id = p_lead_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if v_l.status = 'converted' then return v_l.tenant_id; end if;
  if v_l.status <> 'onboarding_submitted' or v_l.onboarding is null then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'not_submitted');
  end if;
  v_o := v_l.onboarding;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
  if exists (select 1 from public.tenants where lower(btrim(name)) = lower(btrim(v_o ->> 'business_name'))) then
    perform public.raise_contract_error('CONFLICT', 'name_taken');
  end if;

  insert into public.tenants (name, created_by, create_key)
  values (btrim(v_o ->> 'business_name'), auth.uid(), p_key) returning id into v_tenant;
  v_hall := public.provision_hall(v_tenant, v_o ->> 'hall_name', v_o ->> 'time_zone', v_o ->> 'currency', null);
  perform public.provision_owner_invitation(v_hall, v_o ->> 'owner_email');

  v_agent := coalesce(v_l.assigned_to, v_l.created_by);
  insert into public.sales_attributions (lead_id, tenant_id, agent_id) values (p_lead_id, v_tenant, v_agent);
  update public.sales_leads set status = 'converted', tenant_id = v_tenant, updated_at = now() where id = p_lead_id;

  perform public.write_audit(null, 'admin.lead.convert', 'lead', p_lead_id::text, null, null,
    jsonb_build_object('tenant_id', v_tenant, 'hall_id', v_hall, 'agent_id', v_agent));
  return v_tenant;
end $$;

-- ---------------------------------------------------------------------------
-- Sales (sales_agent / sales_admin). No financial or hall data anywhere in these functions.
-- ---------------------------------------------------------------------------

create function public.upsert_lead(
  p_id uuid, p_business_name text, p_contact_name text, p_contact_email text, p_contact_phone text,
  p_city text, p_notes text, p_status text, p_key uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_l public.sales_leads; v_id uuid; v_email text := nullif(lower(btrim(coalesce(p_contact_email, ''))), '');
begin
  perform public.require_sales_user();
  if p_business_name is null or length(btrim(p_business_name)) = 0 or length(p_business_name) > 120 then
    perform public.raise_contract_error('VALIDATION', 'business_name');
  end if;
  if v_email is not null and not public.valid_email(v_email) then perform public.raise_contract_error('VALIDATION', 'email'); end if;
  if length(coalesce(p_contact_name, '')) > 120 or length(coalesce(p_contact_phone, '')) > 40
     or length(coalesce(p_city, '')) > 80 or length(coalesce(p_notes, '')) > 1000 then
    perform public.raise_contract_error('VALIDATION', 'length');
  end if;

  if p_id is null then
    if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
    select * into v_l from public.sales_leads where created_by = auth.uid() and create_key = p_key;
    if found then return v_l.id; end if;
    insert into public.sales_leads (business_name, contact_name, contact_email, contact_phone, city, notes, created_by, assigned_to, create_key)
    values (btrim(p_business_name), nullif(btrim(p_contact_name), ''), v_email, nullif(btrim(p_contact_phone), ''),
            nullif(btrim(p_city), ''), nullif(btrim(p_notes), ''), auth.uid(),
            case when public.has_platform_role('sales_agent') then auth.uid() end, p_key)
    returning id into v_id;
    perform public.write_audit(null, 'sales.lead.create', 'lead', v_id::text, null, null, jsonb_build_object('business_name', btrim(p_business_name)));
    return v_id;
  end if;

  select * into v_l from public.sales_leads where id = p_id for update;
  if not found or not public.can_see_lead(v_l.created_by, v_l.assigned_to) then perform public.raise_contract_error('PERMISSION_DENIED'); end if;
  if v_l.status = 'converted' then perform public.raise_contract_error('PRECONDITION_FAILED', 'converted'); end if;
  if p_status is not null and p_status not in ('new', 'contacted', 'qualified', 'lost') then
    perform public.raise_contract_error('VALIDATION', 'status');     -- onboarding_submitted/converted have their own paths
  end if;
  update public.sales_leads
     set business_name = btrim(p_business_name), contact_name = nullif(btrim(p_contact_name), ''), contact_email = v_email,
         contact_phone = nullif(btrim(p_contact_phone), ''), city = nullif(btrim(p_city), ''), notes = nullif(btrim(p_notes), ''),
         status = case when v_l.status = 'onboarding_submitted' then v_l.status else coalesce(p_status, v_l.status) end,
         updated_at = now()
   where id = p_id;
  perform public.write_audit(null, 'sales.lead.update', 'lead', p_id::text, null,
    jsonb_build_object('status', v_l.status), jsonb_build_object('status', coalesce(p_status, v_l.status)));
  return p_id;
end $$;

create function public.list_leads(p_status text default null, p_limit int default 25, p_offset int default 0, p_lead_id uuid default null)
returns table (id uuid, business_name text, contact_name text, contact_email text, contact_phone text, city text, notes text,
               status text, assigned_to uuid, assigned_name text, created_by_name text, onboarding jsonb,
               created_at timestamptz, updated_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_sales_user();
  return query
    select l.id, l.business_name, l.contact_name, l.contact_email, l.contact_phone, l.city, l.notes, l.status,
           l.assigned_to, coalesce(pa.display_name, pa.email), coalesce(pc.display_name, pc.email), l.onboarding,
           l.created_at, l.updated_at, count(*) over ()
      from public.sales_leads l
      left join public.profiles pa on pa.id = l.assigned_to
      left join public.profiles pc on pc.id = l.created_by
     where public.can_see_lead(l.created_by, l.assigned_to)
       and (p_lead_id is null or l.id = p_lead_id) and (p_status is null or l.status = p_status)
     order by l.updated_at desc, l.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- DEC-16: a request, not a hall. Needs the details a super admin must have to provision the customer.
create function public.submit_onboarding(p_lead_id uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_l public.sales_leads; v_clean jsonb; v_email text;
begin
  perform public.require_sales_user();
  select * into v_l from public.sales_leads where id = p_lead_id for update;
  if not found or not public.can_see_lead(v_l.created_by, v_l.assigned_to) then perform public.raise_contract_error('PERMISSION_DENIED'); end if;
  if v_l.status = 'converted' then perform public.raise_contract_error('PRECONDITION_FAILED', 'converted'); end if;
  if v_l.status = 'onboarding_submitted' then perform public.raise_contract_error('PRECONDITION_FAILED', 'already_submitted'); end if;
  v_email := lower(btrim(coalesce(p_payload ->> 'owner_email', '')));
  if length(btrim(coalesce(p_payload ->> 'business_name', ''))) not between 1 and 120 then perform public.raise_contract_error('VALIDATION', 'business_name'); end if;
  if length(btrim(coalesce(p_payload ->> 'hall_name', ''))) not between 1 and 120 then perform public.raise_contract_error('VALIDATION', 'hall_name'); end if;
  if not exists (select 1 from pg_timezone_names where name = p_payload ->> 'time_zone') then perform public.raise_contract_error('VALIDATION', 'time_zone'); end if;
  if coalesce(p_payload ->> 'currency', '') !~ '^[A-Z]{3}$' then perform public.raise_contract_error('VALIDATION', 'currency'); end if;
  if not public.valid_email(v_email) then perform public.raise_contract_error('VALIDATION', 'email'); end if;
  -- Only the known keys are stored (no arbitrary client JSON).
  v_clean := jsonb_build_object('business_name', btrim(p_payload ->> 'business_name'), 'hall_name', btrim(p_payload ->> 'hall_name'),
                                'time_zone', p_payload ->> 'time_zone', 'currency', p_payload ->> 'currency', 'owner_email', v_email);
  update public.sales_leads set onboarding = v_clean, status = 'onboarding_submitted', updated_at = now() where id = p_lead_id;
  perform public.write_audit(null, 'sales.onboarding.submit', 'lead', p_lead_id::text, null, null, v_clean);
end $$;

create function public.assign_lead(p_lead_id uuid, p_agent_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_l public.sales_leads;
begin
  if not public.has_platform_role('sales_admin') then perform public.raise_contract_error('PERMISSION_DENIED'); end if;
  select * into v_l from public.sales_leads where id = p_lead_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if v_l.status = 'converted' then perform public.raise_contract_error('PRECONDITION_FAILED', 'converted'); end if;
  if not exists (select 1 from public.user_role_assignments a join public.profiles p on p.id = a.user_id
                  where a.user_id = p_agent_id and a.role_key = 'sales_agent' and p.status = 'active') then
    perform public.raise_contract_error('NOT_FOUND');
  end if;
  update public.sales_leads set assigned_to = p_agent_id, updated_at = now() where id = p_lead_id;
  perform public.write_audit(null, 'sales.lead.assign', 'lead', p_lead_id::text, null,
    jsonb_build_object('assigned_to', v_l.assigned_to), jsonb_build_object('assigned_to', p_agent_id));
end $$;

create function public.list_sales_agents()
returns table (user_id uuid, display_name text, email text, status text, leads_count int, attributions_count int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_platform_role('sales_admin') then perform public.raise_contract_error('PERMISSION_DENIED'); end if;
  return query
    select p.id, p.display_name, p.email, p.status,
           (select count(*)::int from public.sales_leads l where l.assigned_to = p.id),
           (select count(*)::int from public.sales_attributions s where s.agent_id = p.id)
      from public.user_role_assignments a join public.profiles p on p.id = a.user_id
     where a.role_key = 'sales_agent' order by p.display_name nulls last, p.email;
end $$;

create function public.list_attributions(p_limit int default 25, p_offset int default 0)
returns table (id uuid, lead_id uuid, business_name text, tenant_name text, agent_id uuid, agent_name text, status text,
               dispute_reason text, resolution_note text, created_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_sales_user();
  return query
    select s.id, s.lead_id, l.business_name, t.name, s.agent_id, coalesce(p.display_name, p.email), s.status,
           s.dispute_reason, s.resolution_note, s.created_at, count(*) over ()
      from public.sales_attributions s
      join public.sales_leads l on l.id = s.lead_id
      join public.tenants t on t.id = s.tenant_id
      join public.profiles p on p.id = s.agent_id
     where public.has_platform_role('sales_admin') or s.agent_id = auth.uid()
     order by (s.status = 'disputed') desc, s.created_at desc, s.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.dispute_attribution(p_attribution_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.sales_attributions; v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.require_sales_user();
  select * into v_s from public.sales_attributions where id = p_attribution_id for update;
  -- Any sales user may dispute: an agent who believes the lead was theirs usually is not the attributed one.
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  if v_s.status = 'disputed' then return; end if;
  update public.sales_attributions set status = 'disputed', dispute_reason = v_reason, disputed_by = auth.uid() where id = p_attribution_id;
  perform public.write_audit(null, 'sales.attribution.dispute', 'attribution', p_attribution_id::text, v_reason, null, null);
end $$;

-- p_new_agent_id null = keep the current agent.
create function public.resolve_attribution_dispute(p_attribution_id uuid, p_new_agent_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.sales_attributions; v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.has_platform_role('sales_admin') then perform public.raise_contract_error('PERMISSION_DENIED'); end if;
  select * into v_s from public.sales_attributions where id = p_attribution_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if length(v_note) < 3 or length(v_note) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  if v_s.status <> 'disputed' then perform public.raise_contract_error('PRECONDITION_FAILED', 'not_disputed'); end if;
  if p_new_agent_id is not null and not exists (select 1 from public.user_role_assignments a join public.profiles p on p.id = a.user_id
        where a.user_id = p_new_agent_id and a.role_key = 'sales_agent' and p.status = 'active') then
    perform public.raise_contract_error('NOT_FOUND');
  end if;
  update public.sales_attributions
     set status = 'resolved', resolution_note = v_note, resolved_by = auth.uid(), agent_id = coalesce(p_new_agent_id, agent_id)
   where id = p_attribution_id;
  perform public.write_audit(null, 'sales.attribution.resolve', 'attribution', p_attribution_id::text, v_note,
    jsonb_build_object('agent_id', v_s.agent_id), jsonb_build_object('agent_id', coalesce(p_new_agent_id, v_s.agent_id)));
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on function
  public.can_see_lead(uuid, uuid), public.require_super_admin(), public.require_sales_user(), public.valid_email(text),
  public.provision_hall(uuid, text, text, text, uuid), public.provision_owner_invitation(uuid, text),
  public.admin_platform_metrics(), public.admin_list_tenants(text, int, int, uuid), public.admin_create_tenant(text, uuid),
  public.admin_list_halls(uuid), public.admin_create_hall(uuid, text, text, text, uuid), public.admin_invite_owner(uuid, text),
  public.admin_set_tenant_status(uuid, text, text), public.admin_set_hall_status(uuid, text, text),
  public.admin_list_users(text, int, int), public.admin_assign_platform_role(text, text),
  public.admin_revoke_platform_role(uuid, text), public.admin_set_user_status(uuid, text, text),
  public.admin_list_audit(int, int, text), public.admin_convert_lead(uuid, uuid), public.admin_list_onboarding_requests(),
  public.upsert_lead(uuid, text, text, text, text, text, text, text, uuid), public.list_leads(text, int, int, uuid),
  public.submit_onboarding(uuid, jsonb), public.assign_lead(uuid, uuid), public.list_sales_agents(),
  public.list_attributions(int, int), public.dispute_attribution(uuid, text),
  public.resolve_attribution_dispute(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function
  public.can_see_lead(uuid, uuid),
  public.admin_platform_metrics(), public.admin_list_tenants(text, int, int, uuid), public.admin_create_tenant(text, uuid),
  public.admin_list_halls(uuid), public.admin_create_hall(uuid, text, text, text, uuid), public.admin_invite_owner(uuid, text),
  public.admin_set_tenant_status(uuid, text, text), public.admin_set_hall_status(uuid, text, text),
  public.admin_list_users(text, int, int), public.admin_assign_platform_role(text, text),
  public.admin_revoke_platform_role(uuid, text), public.admin_set_user_status(uuid, text, text),
  public.admin_list_audit(int, int, text), public.admin_convert_lead(uuid, uuid), public.admin_list_onboarding_requests(),
  public.upsert_lead(uuid, text, text, text, text, text, text, text, uuid), public.list_leads(text, int, int, uuid),
  public.submit_onboarding(uuid, jsonb), public.assign_lead(uuid, uuid), public.list_sales_agents(),
  public.list_attributions(int, int), public.dispute_attribution(uuid, text),
  public.resolve_attribution_dispute(uuid, uuid, text)
  to authenticated;
