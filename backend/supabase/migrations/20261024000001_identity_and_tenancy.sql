-- Identity & tenancy foundation (spec §3.2, §4, §5, §18.1, §21).
--
-- PROVISIONAL: the permission matrix (role -> permissions) is a working default seeded below.
-- The final matrix is pending approval (decision DEC-01 in web/docs/planning/WEB_RISKS_AND_DECISIONS.md).
-- Changing it later is a data change in role_permissions, not a schema change.
--
-- Conventions:
--  * Clients never write these tables directly. Writes happen through SECURITY DEFINER functions
--    (added in later migrations) or trusted server code.
--  * Every SECURITY DEFINER function sets a fixed search_path (spec §21.2).

-- Functions created from now on are NOT callable by anon/public unless granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_at  timestamptz not null default now()
);

create table public.halls (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id),
  name        text not null check (length(btrim(name)) > 0),
  status      text not null default 'active' check (status in ('active', 'inactive')),
  time_zone   text not null default 'UTC',
  currency    char(3) not null default 'USD' check (currency = upper(currency)),
  created_at  timestamptz not null default now()
);
create index halls_tenant_id_idx on public.halls (tenant_id);

-- One profile per authenticated user. Created automatically on first sign-in (see trigger below).
-- Authentication is not authorization: a new profile has NO roles (spec §5.2).
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  email         text,
  avatar_url    text,
  status        text not null default 'active' check (status in ('active', 'inactive')),
  created_at    timestamptz not null default now()
);

create table public.permissions (
  key          text primary key,
  description  text not null
);

create table public.roles (
  key          text primary key,
  scope        text not null check (scope in ('hall', 'platform')),
  description  text not null
);

create table public.role_permissions (
  role_key        text not null references public.roles (key) on delete cascade,
  permission_key  text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);

-- Platform-scope roles (super_admin, sales_agent, sales_admin) assigned to a user.
create table public.user_role_assignments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role_key    text not null references public.roles (key),
  created_at  timestamptz not null default now(),
  unique (user_id, role_key)
);

-- A user's relationship with ONE hall (spec §3.2: different relationships per hall).
create table public.hall_memberships (
  id                    uuid primary key default gen_random_uuid(),
  hall_id               uuid not null references public.halls (id),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  role_key              text not null references public.roles (key),
  status                text not null default 'active' check (status in ('active', 'inactive')),
  discount_limit_minor  bigint check (discount_limit_minor is null or discount_limit_minor >= 0),
  created_at            timestamptz not null default now(),
  unique (hall_id, user_id)
);
create index hall_memberships_user_id_idx on public.hall_memberships (user_id);

-- Extra permissions granted to one membership on top of its role (owner customization).
create table public.hall_membership_grants (
  membership_id   uuid not null references public.hall_memberships (id) on delete cascade,
  permission_key  text not null references public.permissions (key) on delete cascade,
  primary key (membership_id, permission_key)
);

-- Append-only audit trail (spec §21.3).
create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  actor_id     uuid references public.profiles (id),
  hall_id      uuid references public.halls (id),
  action       text not null,
  target_type  text,
  target_id    text,
  reason       text,
  before_data  jsonb,
  after_data   jsonb
);
create index audit_logs_hall_created_idx on public.audit_logs (hall_id, created_at desc);

create function public.audit_logs_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs is append-only' using errcode = 'P0001';
end $$;

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

-- ---------------------------------------------------------------------------
-- Role and permission helpers (SECURITY DEFINER so RLS policies can call them
-- without recursion; they only ever look at auth.uid()).
-- ---------------------------------------------------------------------------

create function public.is_active_user() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active'
  );
$$;

create function public.has_platform_role(p_role text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_active_user() and exists (
    select 1 from public.user_role_assignments a
    where a.user_id = auth.uid() and a.role_key = p_role
  );
$$;

-- True when the caller has an ACTIVE membership of an ACTIVE hall in an ACTIVE tenant.
create function public.is_hall_member(p_hall_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_active_user() and exists (
    select 1
    from public.hall_memberships m
    join public.halls h on h.id = m.hall_id
    join public.tenants t on t.id = h.tenant_id
    where m.hall_id = p_hall_id and m.user_id = auth.uid()
      and m.status = 'active' and h.status = 'active' and t.status = 'active'
  );
$$;

-- The authority for hall-scoped permission checks. RLS policies and RPCs both use it.
-- A client-supplied hall id is only a request; this decides whether it is allowed (spec §21.1).
create function public.has_hall_permission(p_hall_id uuid, p_permission text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_hall_member(p_hall_id) and exists (
    select 1
    from public.hall_memberships m
    where m.hall_id = p_hall_id and m.user_id = auth.uid() and m.status = 'active'
      and (
        exists (
          select 1 from public.role_permissions rp
          where rp.role_key = m.role_key and rp.permission_key = p_permission
        )
        or exists (
          select 1 from public.hall_membership_grants g
          where g.membership_id = m.id and g.permission_key = p_permission
        )
      )
  );
$$;

-- Effective permission list for one membership (used by get_my_context).
create function public.membership_permissions(p_membership_id uuid) returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct perm order by perm), '{}')
  from (
    select rp.permission_key as perm
    from public.hall_memberships m
    join public.role_permissions rp on rp.role_key = m.role_key
    where m.id = p_membership_id
    union
    select g.permission_key
    from public.hall_membership_grants g
    where g.membership_id = p_membership_id
  ) x;
$$;

-- ---------------------------------------------------------------------------
-- get_my_context(): single round trip for the web layouts (contract: WEB_API_AND_DATA_CONTRACTS.md §2)
-- Identity comes ONLY from the validated JWT. Returns NULL when unauthenticated.
-- ---------------------------------------------------------------------------

create function public.get_my_context() returns jsonb
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
      'avatar_url', v_profile.avatar_url
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

-- ---------------------------------------------------------------------------
-- Profile creation on first sign-in. Grants NO roles (spec §5.2).
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-Level Security (spec §21.1). Default deny: no policy = no access.
-- ---------------------------------------------------------------------------

alter table public.tenants                enable row level security;
alter table public.halls                  enable row level security;
alter table public.profiles               enable row level security;
alter table public.permissions            enable row level security;
alter table public.roles                  enable row level security;
alter table public.role_permissions       enable row level security;
alter table public.user_role_assignments  enable row level security;
alter table public.hall_memberships       enable row level security;
alter table public.hall_membership_grants enable row level security;
alter table public.audit_logs             enable row level security;

-- Own profile only. (Staff directory access goes through hall_memberships joins in later RPCs.)
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

-- Reference data is not secret.
create policy permissions_select on public.permissions
  for select to authenticated using (true);
create policy roles_select on public.roles
  for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions
  for select to authenticated using (true);

create policy tenants_select on public.tenants
  for select to authenticated using (
    public.has_platform_role('super_admin')
    or exists (
      select 1 from public.halls h
      where h.tenant_id = tenants.id and public.is_hall_member(h.id)
    )
  );

create policy halls_select on public.halls
  for select to authenticated using (
    public.is_hall_member(id) or public.has_platform_role('super_admin')
  );

create policy user_role_assignments_select_own on public.user_role_assignments
  for select to authenticated using (
    user_id = auth.uid() or public.has_platform_role('super_admin')
  );

create policy hall_memberships_select on public.hall_memberships
  for select to authenticated using (
    user_id = auth.uid()
    or public.has_hall_permission(hall_id, 'employee.manage')
    or public.has_platform_role('super_admin')
  );

create policy hall_membership_grants_select on public.hall_membership_grants
  for select to authenticated using (
    exists (
      select 1 from public.hall_memberships m
      where m.id = membership_id
        and (m.user_id = auth.uid() or public.has_hall_permission(m.hall_id, 'employee.manage'))
    )
  );

-- Hall audit logs: hall owners (hall.settings.manage is the provisional audit-view permission).
-- Platform-level entries (hall_id is null) are visible to super admins only.
create policy audit_logs_select on public.audit_logs
  for select to authenticated using (
    (hall_id is not null and public.has_hall_permission(hall_id, 'hall.settings.manage'))
    or public.has_platform_role('super_admin')
  );

-- ---------------------------------------------------------------------------
-- Privileges: clients can read (subject to RLS) but never write directly.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
grant select on public.tenants, public.halls, public.profiles, public.permissions, public.roles,
  public.role_permissions, public.user_role_assignments, public.hall_memberships,
  public.hall_membership_grants, public.audit_logs to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.get_my_context(),
  public.has_hall_permission(uuid, text),
  public.is_hall_member(uuid),
  public.has_platform_role(text)
  to authenticated;
-- Internal helpers (is_active_user, membership_permissions, handle_new_user, audit trigger) stay
-- callable only by the database owner and by other SECURITY DEFINER functions.
