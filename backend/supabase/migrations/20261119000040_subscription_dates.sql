-- A hall's subscription starts when the hall is added and runs for the chosen plan's period:
-- monthly 1 month, quarterly 3, semiannual 6, annual 12. The unlimited plan never ends.
-- Only the dates are recorded here; nothing is switched off when a subscription ends.

alter table public.halls
  add column subscription_started_at timestamptz not null default now(),
  add column subscription_ends_at timestamptz;

-- Halls that already exist started when they were created, on the plan they have.
update public.halls h
   set subscription_started_at = h.created_at,
       subscription_ends_at = case sp.period
         when 'monthly' then h.created_at + interval '1 month'
         when 'quarterly' then h.created_at + interval '3 months'
         when 'semiannual' then h.created_at + interval '6 months'
         when 'annual' then h.created_at + interval '12 months'
       end
  from public.subscription_plans sp
 where sp.id = h.subscription_plan_id;

-- The start and end of a plan chosen in the add-hall form (the unlimited plan leaves the end empty).
create or replace function public.admin_create_hall_with_owner(
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
  v_now timestamptz := now();
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
           subscription_currency = v_plan.currency,
           subscription_started_at = v_now,
           subscription_ends_at = case v_plan.period
             when 'monthly' then v_now + interval '1 month'
             when 'quarterly' then v_now + interval '3 months'
             when 'semiannual' then v_now + interval '6 months'
             when 'annual' then v_now + interval '12 months'
           end
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

drop function public.admin_list_halls_sold(text, integer, integer);
create function public.admin_list_halls_sold(p_search text default null, p_limit integer default 25, p_offset integer default 0)
returns table (hall_id uuid, hall_name text, hall_status text, currency text, owner_email text, owner_username text,
               sold_by_id uuid, sold_by_name text, sold_by_email text, sold_at timestamptz,
               attribution_status text, created_at timestamptz, total bigint,
               plan_name text, plan_price_minor bigint, plan_currency text, plan_kind text, plan_period text,
               subscription_started_at timestamptz, subscription_ends_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.require_super_admin();
  return query
    select h.id, h.name, h.status, h.currency::text, o.email, o.username,
           s.agent_id, coalesce(p.display_name, p.email), p.email, s.created_at, s.status, h.created_at, count(*) over (),
           sp.name, h.subscription_price_minor, h.subscription_currency::text, sp.kind, sp.period,
           h.subscription_started_at, h.subscription_ends_at
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

revoke all on function public.admin_create_hall_with_owner(text, text, text, text, text, uuid, uuid) from public, anon;
revoke all on function public.admin_list_halls_sold(text, integer, integer) from public, anon;
grant execute on function public.admin_create_hall_with_owner(text, text, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.admin_list_halls_sold(text, integer, integer) to authenticated;
