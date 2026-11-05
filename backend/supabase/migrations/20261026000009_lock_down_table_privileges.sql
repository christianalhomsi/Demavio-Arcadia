-- Hardening found on the real Supabase staging project (not visible in the PGlite harness):
-- Supabase grants ALL privileges on every new table in `public` to anon and authenticated through
-- default privileges. Migration 0001 revoked them only for the tables that existed at that moment, so
-- every table created later (hall_settings ... refunds) kept INSERT/UPDATE/DELETE/TRUNCATE grants for
-- both roles. Row-Level Security still blocked row access (no write policies exist, and anon has no
-- policy at all), and a smoke test confirmed balances were not changed, but:
--   * TRUNCATE is not subject to RLS, and
--   * "RLS is the only barrier" is weaker than the design intends (spec §21.1: clients are read-only,
--     all writes go through audited functions).
--
-- This migration (1) removes the broad grants, (2) grants SELECT only on the tables clients read,
-- and (3) stops Supabase's default privileges from re-granting on tables created in the future.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on
  public.tenants, public.halls, public.profiles, public.permissions, public.roles,
  public.role_permissions, public.user_role_assignments, public.hall_memberships,
  public.hall_membership_grants, public.audit_logs,
  public.hall_settings, public.hall_working_hours,
  public.devices, public.device_maintenance, public.agents, public.agent_commands,
  public.agent_command_events, public.v_device_live_status,
  public.reservations, public.reservation_events, public.sessions, public.session_events,
  public.pricing_rules, public.session_pricing_snapshots, public.invoices, public.invoice_items,
  public.payments, public.wallets, public.wallet_transactions, public.refunds
  to authenticated;
-- Deliberately NOT readable by clients: hall_invitations (token hashes) and invoice_counters.
-- anon gets nothing: the dashboard requires a signed-in user.

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
