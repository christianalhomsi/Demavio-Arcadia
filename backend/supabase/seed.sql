-- Local/test seed data ONLY. Never run against staging or production.
-- Three halls, and one user per scenario used by the web authz tests
-- (web/docs/planning/WEB_TESTING_STRATEGY.md §2). No passwords: sign-in is Google-only,
-- and tests mint sessions directly.

insert into public.halls (id, name, time_zone, currency) values
  ('22222222-0000-0000-0000-000000000001', 'Hall H1', 'Asia/Dubai', 'USD'),
  ('22222222-0000-0000-0000-000000000002', 'Hall H2', 'Asia/Dubai', 'USD'),
  ('22222222-0000-0000-0000-000000000003', 'Hall H3', 'UTC', 'EUR');

-- auth.users rows; the on_auth_user_created trigger creates the matching profiles with no roles.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
  ('33333333-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner.h1h2@example.test',      '{"full_name":"Owner H1+H2"}',     now(), now()),
  ('33333333-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee.h1@example.test',      '{"full_name":"Employee H1"}',     now(), now()),
  ('33333333-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'former.employee.h1@example.test','{"full_name":"Former Employee H1"}',now(), now()),
  ('33333333-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner.h3@example.test',        '{"full_name":"Owner H3"}',        now(), now()),
  ('33333333-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'super.admin@example.test',     '{"full_name":"Super Admin"}',     now(), now()),
  ('33333333-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sales.agent@example.test',     '{"full_name":"Sales Agent"}',     now(), now()),
  ('33333333-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'customer.only@example.test',   '{"full_name":"Customer Only"}',   now(), now()),
  ('33333333-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deactivated@example.test',      '{"full_name":"Deactivated User"}',now(), now());

update public.profiles set status = 'inactive' where id = '33333333-0000-0000-0000-000000000011';

insert into public.hall_memberships (hall_id, user_id, role_key, status) values
  ('22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-00000000000a', 'owner',    'active'),
  ('22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-00000000000a', 'owner',    'active'),
  ('22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-00000000000b', 'employee', 'active'),
  ('22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-00000000000c', 'employee', 'inactive'),
  ('22222222-0000-0000-0000-000000000003', '33333333-0000-0000-0000-00000000000d', 'owner',    'active'),
  ('22222222-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000011', 'employee', 'active');

insert into public.user_role_assignments (user_id, role_key) values
  ('33333333-0000-0000-0000-00000000000e', 'super_admin'),
  ('33333333-0000-0000-0000-00000000000f', 'sales_agent');

-- Devices and Agents (phase W6). Agent rows are normally written by the Agent protocol; seeded here
-- so the web and tests have connectivity states to show.
insert into public.devices (id, hall_id, name, device_type, category, capabilities) values
  ('44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'PC-01',      'pc',      'Standard', array['lock','unlock','shutdown','restart']),
  ('44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 'PC-02',      'pc',      'VIP',      array['lock','unlock']),
  ('44444444-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000001', 'Console-01', 'console', null,       '{}'),
  ('44444444-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000003', 'PC-H3-01',   'pc',      'Standard', array['lock','unlock','shutdown','restart']);

insert into public.agents (hall_id, device_id, version, last_heartbeat_at, sync_state) values
  ('22222222-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', '1.0.0', now(),                      'synced'),
  ('22222222-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', '1.0.0', now() - interval '1 hour',  'unknown'),
  ('22222222-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000004', '1.0.0', now(),                      'synced');

-- Pricing (phase W8). Rates are in minor units per hour: hall 600 = 6.00 USD/h, VIP category 900 = 9.00 USD/h.
insert into public.pricing_rules (hall_id, scope, category, rate_per_hour_minor) values
  ('22222222-0000-0000-0000-000000000001', 'hall', null, 600);
insert into public.pricing_rules (hall_id, scope, category, rate_per_hour_minor) values
  ('22222222-0000-0000-0000-000000000001', 'category', 'VIP', 900);
