-- Subscription prices for halls. A super admin keeps a list of plans (a name and a price in SYP or USD);
-- the add-hall form offers the active ones as a choice. The hall keeps the price that was agreed at that
-- moment, so changing a plan later never rewrites what an existing hall was sold for.
-- Plans are never deleted, only deactivated, so every hall keeps pointing at its plan.

create table public.subscription_plans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 80),
  price_minor bigint not null check (price_minor >= 0),
  currency    char(3) not null check (currency in ('SYP', 'USD')),
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_by  uuid references public.profiles (id),
  create_key  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index subscription_plans_create_key_idx on public.subscription_plans (created_by, create_key)
  where create_key is not null;
alter table public.subscription_plans enable row level security;
revoke all on public.subscription_plans from anon, authenticated;

alter table public.halls
  add column subscription_plan_id uuid references public.subscription_plans (id),
  add column subscription_price_minor bigint check (subscription_price_minor is null or subscription_price_minor >= 0),
  add column subscription_currency char(3) check (subscription_currency is null or subscription_currency in ('SYP', 'USD'));
create index halls_subscription_plan_idx on public.halls (subscription_plan_id);

-- Plans with how many halls use each. Super admins see all; sales managers (who add halls) only active ones.
create function public.admin_list_subscription_plans()
returns table (id uuid, name text, price_minor bigint, currency text, status text, halls_count integer, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_admin boolean := public.has_platform_role('super_admin');
begin
  if not (v_admin or public.has_platform_role('sales_admin')) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select s.id, s.name, s.price_minor, s.currency::text, s.status,
           (select count(*)::int from public.halls h where h.subscription_plan_id = s.id),
           s.created_at
      from public.subscription_plans s
     where v_admin or s.status = 'active'
     order by (s.status = 'active') desc, s.currency, s.price_minor, s.name;
end $$;

-- Creates (p_id null, retry-safe with p_key) or edits a plan. Editing never changes halls already sold.
create function public.admin_save_subscription_plan(
  p_id uuid, p_name text, p_price_minor bigint, p_currency text, p_key uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_cur text := upper(btrim(coalesce(p_currency, '')));
  v_id uuid;
begin
  perform public.require_super_admin();
  if length(v_name) not between 1 and 80 then perform public.raise_contract_error('VALIDATION', 'name'); end if;
  if p_price_minor is null or p_price_minor < 0 then perform public.raise_contract_error('VALIDATION', 'price'); end if;
  if v_cur not in ('SYP', 'USD') then perform public.raise_contract_error('VALIDATION', 'currency'); end if;

  if p_id is null then
    if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
    select id into v_id from public.subscription_plans where created_by = auth.uid() and create_key = p_key;
    if found then return v_id; end if;
    insert into public.subscription_plans (name, price_minor, currency, created_by, create_key)
    values (v_name, p_price_minor, v_cur, auth.uid(), p_key) returning id into v_id;
    perform public.write_audit(null, 'admin.subscription_plan.create', 'subscription_plan', v_id::text, null, null,
      jsonb_build_object('name', v_name, 'price_minor', p_price_minor, 'currency', v_cur));
  else
    update public.subscription_plans set name = v_name, price_minor = p_price_minor, currency = v_cur, updated_at = now()
     where id = p_id returning id into v_id;
    if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
    perform public.write_audit(null, 'admin.subscription_plan.update', 'subscription_plan', v_id::text, null, null,
      jsonb_build_object('name', v_name, 'price_minor', p_price_minor, 'currency', v_cur));
  end if;
  return v_id;
end $$;

create function public.admin_set_subscription_plan_status(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  if p_status not in ('active', 'inactive') then perform public.raise_contract_error('VALIDATION', 'status'); end if;
  update public.subscription_plans set status = p_status, updated_at = now() where id = p_id;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  perform public.write_audit(null, 'admin.subscription_plan.status', 'subscription_plan', p_id::text, null, null,
    jsonb_build_object('status', p_status));
end $$;

-- Adding a hall takes an optional plan; the hall keeps that plan's price as it is right now.
drop function public.admin_create_hall_with_owner(text, text, text, text, text, uuid);
create function public.admin_create_hall_with_owner(
  p_hall_name text, p_currency text, p_email text, p_password text, p_username text, p_key uuid,
  p_plan_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_hall uuid;
  v_owner uuid;
  v_name text := btrim(coalesce(p_hall_name, ''));
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_admin boolean := public.has_platform_role('super_admin');
  v_plan public.subscription_plans;
begin
  if not (v_admin or public.has_platform_role('sales_admin')) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
  select id into v_hall from public.halls where created_by = auth.uid() and create_key = p_key;
  if found then return v_hall; end if;

  if length(v_name) = 0 or length(v_name) > 120 then perform public.raise_contract_error('VALIDATION', 'name'); end if;
  if v_currency not in ('SYP', 'USD') then perform public.raise_contract_error('VALIDATION', 'currency'); end if;
  if p_plan_id is not null then
    select * into v_plan from public.subscription_plans where id = p_plan_id and status = 'active';
    if not found then perform public.raise_contract_error('NOT_FOUND', 'plan'); end if;
  end if;

  v_owner := public.create_login_user(p_email, p_password, p_username, v_name);
  v_hall := public.provision_hall(v_name, 'Asia/Damascus', v_currency, p_key);
  if p_plan_id is not null then
    update public.halls
       set subscription_plan_id = v_plan.id, subscription_price_minor = v_plan.price_minor,
           subscription_currency = v_plan.currency
     where id = v_hall;
  end if;
  insert into public.hall_memberships (hall_id, user_id, role_key, status) values (v_hall, v_owner, 'owner', 'active');
  if not v_admin then
    insert into public.sales_attributions (hall_id, agent_id) values (v_hall, auth.uid());
  end if;
  perform public.write_audit(v_hall, 'admin.hall.create_with_owner', 'hall', v_hall::text, null, null,
    jsonb_build_object('owner_id', v_owner, 'owner_email', lower(btrim(p_email)), 'plan_id', p_plan_id));
  return v_hall;
end $$;

-- The halls list also shows each hall's plan and agreed price.
drop function public.admin_list_halls_sold(text, integer, integer);
create function public.admin_list_halls_sold(p_search text default null, p_limit integer default 25, p_offset integer default 0)
returns table (hall_id uuid, hall_name text, hall_status text, currency text, owner_email text, owner_username text,
               sold_by_id uuid, sold_by_name text, sold_by_email text, sold_at timestamptz,
               attribution_status text, created_at timestamptz, total bigint,
               plan_name text, plan_price_minor bigint, plan_currency text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select h.id, h.name, h.status, h.currency::text, o.email, o.username,
           s.agent_id, coalesce(p.display_name, p.email), p.email, s.created_at, s.status, h.created_at, count(*) over (),
           sp.name, h.subscription_price_minor, h.subscription_currency::text
      from public.halls h
      left join lateral (
        select pr.email, pr.username from public.hall_memberships m join public.profiles pr on pr.id = m.user_id
         where m.hall_id = h.id and m.role_key = 'owner' and m.status = 'active' order by m.created_at limit 1
      ) o on true
      left join public.sales_attributions s on s.hall_id = h.id
      left join public.profiles p on p.id = s.agent_id
      left join public.subscription_plans sp on sp.id = h.subscription_plan_id
     where p_search is null or h.name ilike '%' || p_search || '%'
        or o.email ilike '%' || p_search || '%'
        or p.email ilike '%' || p_search || '%' or p.display_name ilike '%' || p_search || '%'
     order by h.created_at desc, h.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

revoke all on function public.admin_list_subscription_plans() from public, anon;
revoke all on function public.admin_save_subscription_plan(uuid, text, bigint, text, uuid) from public, anon;
revoke all on function public.admin_set_subscription_plan_status(uuid, text) from public, anon;
revoke all on function public.admin_create_hall_with_owner(text, text, text, text, text, uuid, uuid) from public, anon;
revoke all on function public.admin_list_halls_sold(text, integer, integer) from public, anon;
grant execute on function public.admin_list_subscription_plans() to authenticated;
grant execute on function public.admin_save_subscription_plan(uuid, text, bigint, text, uuid) to authenticated;
grant execute on function public.admin_set_subscription_plan_status(uuid, text) to authenticated;
grant execute on function public.admin_create_hall_with_owner(text, text, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.admin_list_halls_sold(text, integer, integer) to authenticated;
