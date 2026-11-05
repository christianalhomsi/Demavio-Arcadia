-- "No subscription" no longer exists: every hall has one. Halls that had none move to the unlimited plan,
-- a hall made without choosing a plan (a sales request, a direct insert, a hall added with no choice) also
-- gets the unlimited plan, and the column can no longer be empty.

update public.halls
   set subscription_plan_id = (select id from public.subscription_plans where kind = 'unlimited'),
       subscription_price_minor = 0,
       subscription_currency = null
 where subscription_plan_id is null;

create function public.halls_default_subscription() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.subscription_plan_id is null then
    select id into new.subscription_plan_id from public.subscription_plans where kind = 'unlimited';
    new.subscription_price_minor := 0;
    new.subscription_currency := null;
  end if;
  return new;
end $$;
revoke all on function public.halls_default_subscription() from public, anon, authenticated;

create trigger halls_default_subscription before insert on public.halls
  for each row execute function public.halls_default_subscription();

alter table public.halls alter column subscription_plan_id set not null;
