-- Findings from the Supabase performance advisor on staging after migrations 0010/0011 (W11).
--
-- 1. auth_rls_initplan (WARN): policies that call auth.uid() directly re-evaluate it per row. Wrapping it
--    in (select auth.uid()) makes Postgres evaluate it once per statement. Behaviour is unchanged
--    (the existing RLS tests cover every policy).
-- 2. unindexed_foreign_keys (INFO): indexes only for the foreign keys used by hot queries (joins and
--    lookups by device, customer, invoice, shift, tenant). The remaining advisor items are audit/actor
--    columns that are never filtered on; indexing them would only slow writes.

drop policy profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy user_role_assignments_select_own on public.user_role_assignments;
create policy user_role_assignments_select_own on public.user_role_assignments
  for select to authenticated using (
    user_id = (select auth.uid()) or public.has_platform_role('super_admin')
  );

drop policy hall_memberships_select on public.hall_memberships;
create policy hall_memberships_select on public.hall_memberships
  for select to authenticated using (
    user_id = (select auth.uid())
    or public.has_hall_permission(hall_id, 'employee.manage')
    or public.has_platform_role('super_admin')
  );

drop policy hall_membership_grants_select on public.hall_membership_grants;
create policy hall_membership_grants_select on public.hall_membership_grants
  for select to authenticated using (
    exists (
      select 1 from public.hall_memberships m
      where m.id = membership_id
        and (m.user_id = (select auth.uid()) or public.has_hall_permission(m.hall_id, 'employee.manage'))
    )
  );

drop policy sales_attributions_select on public.sales_attributions;
create policy sales_attributions_select on public.sales_attributions
  for select to authenticated using (
    public.has_platform_role('sales_admin')
    or (public.has_platform_role('sales_agent') and agent_id = (select auth.uid())));

create index sessions_device_fk_idx          on public.sessions (device_id, hall_id);
create index sessions_customer_fk_idx        on public.sessions (customer_id) where customer_id is not null;
create index reservations_device_fk_idx      on public.reservations (device_id, hall_id);
create index reservations_customer_fk_idx    on public.reservations (customer_id) where customer_id is not null;
create index invoices_customer_fk_idx        on public.invoices (customer_id) where customer_id is not null;
create index wallets_customer_fk_idx         on public.wallets (customer_id);
create index refunds_invoice_fk_idx          on public.refunds (invoice_id);
create index payments_shift_fk_idx           on public.payments (shift_id) where shift_id is not null;
create index agents_device_fk_idx            on public.agents (device_id, hall_id);
create index agent_commands_device_fk_idx    on public.agent_commands (device_id, hall_id);
create index device_maintenance_device_fk_idx on public.device_maintenance (device_id, hall_id);
create index sales_leads_tenant_fk_idx       on public.sales_leads (tenant_id) where tenant_id is not null;
create index sales_attributions_tenant_fk_idx on public.sales_attributions (tenant_id);
