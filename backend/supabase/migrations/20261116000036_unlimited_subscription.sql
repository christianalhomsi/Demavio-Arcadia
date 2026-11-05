-- A fixed subscription choice that is always there: unlimited, with no price. It is one built-in plan
-- (kind = 'unlimited') that cannot be edited or deactivated, so the add-hall form always offers it next to
-- the priced plans, and halls on it are counted and listed like any other plan.

alter table public.subscription_plans
  add column kind text not null default 'priced' check (kind in ('priced', 'unlimited'));
alter table public.subscription_plans alter column currency drop not null;
alter table public.subscription_plans
  add constraint subscription_plans_kind_shape check (
    (kind = 'priced' and currency is not null)
    or (kind = 'unlimited' and currency is null and price_minor = 0));
create unique index subscription_plans_one_unlimited_idx on public.subscription_plans (kind) where kind = 'unlimited';

insert into public.subscription_plans (name, price_minor, currency, kind)
values ('Unlimited', 0, null, 'unlimited');

drop function public.admin_list_subscription_plans();
create function public.admin_list_subscription_plans()
returns table (id uuid, name text, price_minor bigint, currency text, status text, halls_count integer,
               created_at timestamptz, kind text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_admin boolean := public.has_platform_role('super_admin');
begin
  if not (v_admin or public.has_platform_role('sales_admin')) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select s.id, s.name, s.price_minor, s.currency::text, s.status,
           (select count(*)::int from public.halls h where h.subscription_plan_id = s.id),
           s.created_at, s.kind
      from public.subscription_plans s
     where v_admin or s.status = 'active'
     order by (s.kind = 'unlimited') desc, (s.status = 'active') desc, s.currency, s.price_minor, s.name;
end $$;

create or replace function public.admin_save_subscription_plan(
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
    if exists (select 1 from public.subscription_plans where id = p_id and kind = 'unlimited') then
      perform public.raise_contract_error('PRECONDITION_FAILED', 'fixed_plan');
    end if;
    update public.subscription_plans set name = v_name, price_minor = p_price_minor, currency = v_cur, updated_at = now()
     where id = p_id returning id into v_id;
    if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
    perform public.write_audit(null, 'admin.subscription_plan.update', 'subscription_plan', v_id::text, null, null,
      jsonb_build_object('name', v_name, 'price_minor', p_price_minor, 'currency', v_cur));
  end if;
  return v_id;
end $$;

create or replace function public.admin_set_subscription_plan_status(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  if p_status not in ('active', 'inactive') then perform public.raise_contract_error('VALIDATION', 'status'); end if;
  if exists (select 1 from public.subscription_plans where id = p_id and kind = 'unlimited') then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'fixed_plan');
  end if;
  update public.subscription_plans set status = p_status, updated_at = now() where id = p_id;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  perform public.write_audit(null, 'admin.subscription_plan.status', 'subscription_plan', p_id::text, null, null,
    jsonb_build_object('status', p_status));
end $$;

drop function public.admin_list_halls_sold(text, integer, integer);
create function public.admin_list_halls_sold(p_search text default null, p_limit integer default 25, p_offset integer default 0)
returns table (hall_id uuid, hall_name text, hall_status text, currency text, owner_email text, owner_username text,
               sold_by_id uuid, sold_by_name text, sold_by_email text, sold_at timestamptz,
               attribution_status text, created_at timestamptz, total bigint,
               plan_name text, plan_price_minor bigint, plan_currency text, plan_kind text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select h.id, h.name, h.status, h.currency::text, o.email, o.username,
           s.agent_id, coalesce(p.display_name, p.email), p.email, s.created_at, s.status, h.created_at, count(*) over (),
           sp.name, h.subscription_price_minor, h.subscription_currency::text, sp.kind
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
revoke all on function public.admin_list_halls_sold(text, integer, integer) from public, anon;
grant execute on function public.admin_list_subscription_plans() to authenticated;
grant execute on function public.admin_list_halls_sold(text, integer, integer) to authenticated;
