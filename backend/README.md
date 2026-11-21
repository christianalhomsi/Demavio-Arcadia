# Backend (Supabase / PostgreSQL)

Shared backend for the web dashboard, the Flutter app and the Windows Agent. Source of truth for tenancy, permissions and (later) all financial rules. See `web/docs/planning/WEB_API_AND_DATA_CONTRACTS.md`.

## What exists

Migrations in `supabase/migrations/` (applied in order):

| Migration | Content |
|---|---|
| `…0001_identity_and_tenancy` | tenants, halls, profiles, roles/permissions, memberships, audit_logs, RLS, `has_hall_permission`, `get_my_context` |
| `…0002_seed_roles_and_permissions` | permission list (spec §4.7), roles, **provisional** role→permission matrix |
| `…0003_hall_settings_employees_audit` | hall settings/hours, invitations, employee and audit RPCs |
| `…0004_devices_maintenance_agents` | devices, maintenance, Agent status, device commands, live view |
| `…0005_reservations_and_sessions` | reservations (overlap exclusion constraint), sessions, check-in/walk-in/end/extend/convert, no-show job entry point |
| `…0006_pin_function_search_paths` | advisor fix: pinned search_path on three helpers |
| `…0007_pricing_invoices_payments` | rates, per-session pricing snapshots, invoices, cash payments, void |
| `…0008_wallets_and_refunds` | wallets, append-only ledger, wallet payments, refunds |
| `…0009_lock_down_table_privileges` | removes Supabase's default INSERT/UPDATE/DELETE/TRUNCATE grants from anon/authenticated (applied to staging 2026-10-26 and verified there) |
| `…0010_shifts_registers_reports` | one register per hall, shifts (open/close, unpaid gate with owner override), append-only signed cash movements, cash payments/top-ups/cash refunds linked to the open shift, basic financial report. applied to staging and smoke-tested 2026-10-26 |
| `…0011_platform_admin_and_sales` | tenant/hall provisioning, owner invitations by super admin, tenant/hall/user status with reasons, platform roles, platform audit, sales leads, onboarding requests and conversion, attribution and disputes. applied to staging and smoke-tested 2026-10-27 |
| `…0012_rls_initplan_and_indexes` | performance advisor fixes: `(select auth.uid())` in five RLS policies, indexes on hot foreign keys. applied to staging and smoke-tested 2026-10-27 |
| `…0013_my_activity_and_report_export` | `list_my_activity` (own audit entries) and `record_report_export` (audit trail for CSV exports). applied to staging and smoke-tested 2026-10-27 |
| `…0014_admin_monitoring_search_sales_report` | `admin_monitoring` (operational only), `admin_search` (reason required, audited), `sales_report` (sales admin). applied to staging and smoke-tested 2026-10-27 |

| `…0049_agent_bridge` | cloud side of the Windows Agent / Hall Server link: `hall_servers` (token hash only), one-time `pairing_codes`, owner RPCs `create_pairing_code` / `revoke_hall_server`, service-role-only `bridge_authenticate` / `bridge_redeem_*` / `bridge_pull_commands` (durable cursor, stale-command expiry, session payloads built from the live session) / `bridge_report_command` (monotonic) / `bridge_heartbeat_batch`; new command statuses `Expired`/`Rejected`/`Unknown`. Tested on PGlite (22 tests). **Applied to staging (`eojzkikvlviignmjxkhn`) on 2026-11-05**; privileges verified there: `anon`/`authenticated` cannot execute any `bridge_*` function, `authenticated` can execute only `create_pairing_code` / `revoke_hall_server`, `token_hash` and `pairing_codes` are unreadable to clients. Not applied anywhere else. |
| `…0050_qa_fixes` | QA fixes (2026-11-16): `apply_discount` refuses the same discount twice on one invoice and counts an employee's limit across everything they discounted on that invoice; `decide_refund` lets a requester withdraw (reject) their own request and lets the hall's only approver approve their own; `capture_session_pricing` refuses to start a session on a device with no rate at all (`no_rate`; an explicit rate of 0 is still allowed). Tested on PGlite. **Applied to staging (`eojzkikvlviignmjxkhn`) on 2026-11-16**; grants verified unchanged, and checked in the browser (own refund withdrawn, session on an unpriced device refused). |
| `…0051_overdue_sessions_and_refund_drawer` | QA fixes, part 2 (2026-11-16): `device_blocking_reason` treats a fixed session that ran past its booked end (not ended yet) as still holding the device now, so check-ins / walk-ins get `device_in_use` instead of a unique-index error; `list_public_device_busy` shows it busy until now; `decide_refund` refuses a cash refund larger than the open drawer (`exceeds_drawer`). Billing of overrun time is unchanged (charged, like package overtime). Tested on PGlite. **Applied to staging (`eojzkikvlviignmjxkhn`) on 2026-11-16**; grants verified unchanged. |
| `…0052_security_review_fixes` | Security review (2026-11-21): only an active owner can create, change, demote or deactivate an owner or set discount limits (`is_hall_owner`), and an owner invitation needs its inviter to still be an owner or a super admin; hall staff see customers by name or @username, never email (`list_wallets`, `list_sessions`, `list_reservations`, `list_invoices`, `invoice_payer`, `get_payment_detail`, `get_shift_unpaid_summary`), and `open_wallet` / `link_guest_wallet` (by email) are closed to clients; `handle_new_user` refuses email accounts not made by the app (SQL helpers mark them trusted, `signup-otp` claims the verified code first), which shuts Supabase's open `/auth/v1/signup`; approving or rejecting hall requests as manager needs the `sales_admin` role, revoking it releases waiting requests, new requests skip a manager who lost the role, and deactivating a user sets `auth.users.banned_until`. Tested on PGlite (`tests/security_review.test.ts`). |

`seed.sql` is local/test data only (never run it on staging/production).

## Not built yet
Tenant/hall write RPCs, expenses, advanced reports, report CSV export, sales, Agent-side protocol is now written (migration 0049 + `functions/agent-bridge`, both on staging), scheduled jobs (only the no-show entry point exists), realtime authorization checks. Writes to tables are intentionally impossible from clients; write RPCs come with the features that need them.

## Provisional decisions
The role→permission matrix is a working default pending DEC-01. Change it with a new migration touching `role_permissions` only.

## Testing

```bash
npm install
npm test
```

Tests run the real migrations and seed on **PGlite** (in-process PostgreSQL) with small stand-ins for Supabase's `auth` schema and `anon`/`authenticated` roles (`tests/supabase-stubs.sql`), impersonating users via JWT claims like PostgREST. This checks RLS, grants and functions, but it is **not** identical to Supabase. Before relying on it, run the migrations on a real local Supabase (`supabase start`, needs Docker) and on a staging project. Not yet done.

## Staging project

A hosted staging project, **gaming-hall-saas-staging** (ref `eojzkikvlviignmjxkhn`, eu-central-2), has migrations 0001 to 0014 applied. It holds reference data only (roles, permissions): no users, halls or test rows.

Verified there (2026-10-26):
- The set of functions callable by `authenticated` is exactly the intended API; `anon` can call none; internal helpers are not callable.
- A rolled-back smoke test on real Supabase passed: profile creation trigger on `auth.users`, owner context, overlap rejected, exclusion constraint blocks a direct overlapping insert, second live session on a device rejected, an outsider and an employee refused, no data persisted.
- Sequential race-shaped calls (overlapping bookings, walk-ins, repeated idempotency key) all produced exactly one winner. This is **not** a true concurrency test (the tooling serialised the calls).
- Security advisor: remaining warnings are the intended RPCs (`authenticated_security_definer_function_executable`; each checks permission inside) and `hall_invitations` having RLS without policies on purpose (read only through `list_hall_invitations`).

### Bootstrap the first owner
Google sign-in alone grants no access. After you sign in once, run `scripts/bootstrap-staging.sql` (edit the email first) in the Supabase SQL editor.

### Real concurrency test
```bash
DATABASE_URL='postgresql://postgres:<password>@db.eojzkikvlviignmjxkhn.supabase.co:5432/postgres' ALLOW_CONCURRENCY_TEST_ON=eojzkikvlviignmjxkhn npm run test:concurrency
```
Opens `WORKERS` (default 8) separate connections and races them `ROUNDS` (default 5) times over: overlapping reservations, walk-ins, same-key idempotency, reservation-vs-walk-in, multi-click check-in, extend and end. Creates and removes its own CONC- data. **Written but not yet run.**

### Applying migrations
Only with explicit approval for the target project: `supabase db push`, or the dashboard / MCP `apply_migration`. Generate web types with `supabase gen types typescript`.

### Google sign-in on staging (manual, in two dashboards)
These steps need your accounts; they cannot be scripted from here.
1. Google Cloud Console, APIs & Services, Credentials: create an **OAuth client ID (Web application)**.
   - Authorized redirect URI: `https://eojzkikvlviignmjxkhn.supabase.co/auth/v1/callback`
   - Authorized JavaScript origin: `http://localhost:3000`
2. Supabase dashboard (project gaming-hall-saas-staging), Authentication, Providers, Google: enable it and paste the client ID and secret. Keep the secret in the dashboard only.
3. Authentication, URL Configuration: Site URL `http://localhost:3000`; add redirect URL `http://localhost:3000/auth/callback`.
4. `web/.env.local` already points at the staging project (URL and public key only). Run `npm run dev` in `web/`, sign in, then run `scripts/bootstrap-staging.sql`.


### Finding on 2026-10-26 (W8 smoke test on staging)
On real Supabase, `anon` and `authenticated` had ALL table privileges (including TRUNCATE) on every table created after migration 0001, because Supabase's default privileges grant them. Row-Level Security still prevented any row change (verified: a wallet balance update changed nothing), but TRUNCATE ignores RLS and the design intends clients to be read-only. The PGlite harness did not show this because bare Postgres has no such defaults; `tests/supabase-stubs.sql` now reproduces them, new tests fail without migration 0009 and pass with it. Fixed by migration 0009, applied and re-verified on staging: `authenticated` has SELECT only on 30 relations, `anon` has no table privileges, `hall_invitations`/`invoice_counters` are unreadable, a client UPDATE/INSERT/DELETE/TRUNCATE now fails with SQLSTATE 42501, and the W8 smoke test still passes. Caveat: Supabase's own `supabase_admin` default privileges still grant anon/authenticated on objects created BY `supabase_admin` (for example tables made in some dashboard tools); everything in this repo is created as `postgres`.
