-- Bootstraps the FIRST owner on a staging project so you can sign in and click through the dashboard.
--
-- Why this is needed: signing in with Google only creates a profile with NO access (spec §5.2).
-- Someone with database access must grant the first owner. Later owners come from invitations.
--
-- How to use:
--   1. Sign in once at http://localhost:3000/login with your Google account (you will land on "No access").
--   2. Replace YOUR_GOOGLE_EMAIL below with that exact email.
--   3. Paste the whole script into the Supabase dashboard SQL editor of the STAGING project and run it.
--
-- It creates one tenant, one hall (Asia/Dubai), makes you its owner and a platform super admin, and adds
-- three sample devices. Safe to run once. Never run it on production.

do $$
declare
  v_email  text := 'YOUR_GOOGLE_EMAIL';
  v_user   uuid;
  v_tenant uuid;
  v_hall   uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'No user with email %. Sign in with Google once first, then re-run.', v_email;
  end if;
  if exists (select 1 from public.hall_memberships where user_id = v_user) then
    raise exception 'This user already has a hall membership; refusing to create another demo hall.';
  end if;

  insert into public.tenants (name) values ('Staging tenant') returning id into v_tenant;
  insert into public.halls (tenant_id, name, time_zone, currency)
    values (v_tenant, 'Staging hall', 'Asia/Dubai', 'USD') returning id into v_hall;
  insert into public.hall_memberships (hall_id, user_id, role_key) values (v_hall, v_user, 'owner');
  insert into public.user_role_assignments (user_id, role_key) values (v_user, 'super_admin') on conflict do nothing;

  insert into public.devices (hall_id, name, device_type, category, capabilities) values
    (v_hall, 'PC-01',      'pc',      'Standard', array['lock', 'unlock', 'shutdown', 'restart']),
    (v_hall, 'PC-02',      'pc',      'VIP',      array['lock', 'unlock']),
    (v_hall, 'Console-01', 'console', null,       '{}');

  raise notice 'Done. Hall id: %', v_hall;
end $$;
