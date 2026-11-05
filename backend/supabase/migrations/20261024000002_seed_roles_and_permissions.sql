-- Reference data: permissions (spec §4.7), roles (§4) and a PROVISIONAL default matrix.
-- Final matrix is pending approval (DEC-01). Adjust role_permissions in a new migration once decided.

insert into public.permissions (key, description) values
  ('reservation.view',        'View reservations and the reservation calendar'),
  ('reservation.create',      'Create reservations'),
  ('reservation.cancel',      'Cancel reservations'),
  ('reservation.check_in',    'Check customers in'),
  ('session.start',           'Start walk-in sessions and view sessions'),
  ('session.end',             'End sessions'),
  ('session.extend',          'Extend sessions'),
  ('device.view',             'View devices and live status'),
  ('device.control',          'Send device commands'),
  ('invoice.view',            'View invoices'),
  ('payment.collect',         'Record payments'),
  ('payment.adjust',          'Create financial adjustments and reversals'),
  ('refund.request',          'Request refunds'),
  ('refund.approve',          'Approve refunds'),
  ('wallet.view',             'View hall wallets'),
  ('wallet.top_up',           'Top up wallets'),
  ('wallet.withdraw',         'Request/approve wallet withdrawals'),
  ('shift.open',              'Open shifts'),
  ('shift.close',             'Close shifts'),
  ('report.financial.view',   'View financial reports'),
  ('employee.manage',         'Manage employees and permissions'),
  ('hall.settings.manage',    'Manage hall settings, pricing and view hall audit log'),
  ('sales.leads.manage',      'Manage sales leads'),
  ('platform.tenants.manage', 'Manage tenants and platform accounts');

insert into public.roles (key, scope, description) values
  ('employee',    'hall',     'Hall employee'),
  ('owner',       'hall',     'Hall owner'),
  ('super_admin', 'platform', 'Super administrator'),
  ('sales_agent', 'platform', 'Sales agent'),
  ('sales_admin', 'platform', 'Sales administrator');

-- Employee: day-to-day operations only. No withdrawals, reports, employee admin or settings (§4.2).
insert into public.role_permissions (role_key, permission_key)
select 'employee', k from unnest(array[
  'reservation.view', 'reservation.create', 'reservation.cancel', 'reservation.check_in',
  'session.start', 'session.end', 'session.extend',
  'device.view', 'device.control',
  'invoice.view', 'payment.collect', 'refund.request',
  'wallet.view', 'wallet.top_up',
  'shift.open', 'shift.close'
]) as k;

-- Owner: everything hall-scoped. Never platform or sales permissions (§4.3).
insert into public.role_permissions (role_key, permission_key)
select 'owner', key from public.permissions
where key not in ('platform.tenants.manage', 'sales.leads.manage');

-- Platform roles. Sales roles get NO finance permissions; super admin gets no hall financial
-- permissions either, so admin access cannot silently bypass financial controls (§4.4, §4.5).
insert into public.role_permissions (role_key, permission_key) values
  ('super_admin', 'platform.tenants.manage'),
  ('sales_agent', 'sales.leads.manage'),
  ('sales_admin', 'sales.leads.manage');

-- Role scope integrity: hall_memberships may only use hall-scope roles; assignments only platform roles.
create function public.enforce_role_scope() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_scope text;
begin
  select scope into v_scope from public.roles where key = new.role_key;
  if tg_table_name = 'hall_memberships' and v_scope is distinct from 'hall' then
    raise exception 'hall_memberships requires a hall-scope role' using errcode = 'P0001';
  end if;
  if tg_table_name = 'user_role_assignments' and v_scope is distinct from 'platform' then
    raise exception 'user_role_assignments requires a platform-scope role' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger hall_memberships_role_scope
  before insert or update of role_key on public.hall_memberships
  for each row execute function public.enforce_role_scope();

create trigger user_role_assignments_role_scope
  before insert or update of role_key on public.user_role_assignments
  for each row execute function public.enforce_role_scope();
