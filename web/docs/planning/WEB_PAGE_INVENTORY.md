# Web Page Inventory

Route list and access summary: `WEB_ARCHITECTURE.md` §5. This document specifies each page/feature.

## 0. Conventions applied to every page (not repeated below unless different)

- **Loading**: route `loading.tsx` skeleton matching layout; mutations show pending button state and disable resubmission (idempotency key retained).
- **Empty**: `EmptyState` with explanation and, if permitted, primary action.
- **Error**: `error.tsx` with retry and support reference ID; action errors render inline (`fieldErrors`) or as a toast with mapped message (`WEB_ARCHITECTURE.md` §9).
- **Success**: toast + refetch of authoritative data (never optimistic for financial values).
- **Permission denied**: no hall membership → 404; membership but missing permission → `Forbidden` page (403); action-level denial from backend → toast "You don't have permission…" and refetch permissions.
- **Times** in hall time zone with zone label; **money** via `Money` component with record currency.
- **Tests**: every page has a component test for loading/empty/error states and a Z test that an unpermitted role cannot load it.

---

## A. Authentication & shell

### A1 `/login`
- Purpose: start Google sign-in. Roles: anonymous. Components: `GoogleSignInButton`, error banner.
- Data: none. Dependency: Supabase Auth `signInWithOAuth({provider:'google', redirectTo: APP_URL/auth/callback?next=…})`.
- Actions: Continue with Google. Validation: `next` must be relative same-origin path.
- States: error banner for `?error=cancelled|failed|inactive`. Authenticated users are redirected away.
- Acceptance: success → callback → correct landing; cancel → `/login?error=cancelled`.
- Tests: U (`next` sanitizer), E (mocked OAuth in test env).

### A2 `/auth/callback` (route handler)
- Exchanges code for session, then redirects to `next` or role-based landing: SA → `/admin`, sales → `/sales`, single hall → `/halls/[id]`, multiple → `/select-hall`, none → `/no-access`.
- Errors → `/login?error=failed`. Tests: I for landing logic (pure function `resolveLanding(context)`).

### A3 `/no-access`
- For authenticated users without privileged roles (customers) or deactivated profiles. Shows account email, sign-out, and "ask your hall owner for an invitation". No data queries beyond own context.

### A4 `/select-hall`
- Roles: users with ≥1 membership. Data: memberships (hall name, role, status). Inactive halls shown disabled. Action: choose hall (stores `last_hall_id` cookie; re-validated on use).
- Acceptance: only member halls listed. Tests: Z.

### A5 App shell (`(app)/layout.tsx`)
- Components: `Sidebar` (permission-filtered nav), `Topbar` (hall switcher, notifications bell, user menu), `Breadcrumbs`, skip link.
- Responsive: sidebar collapses to drawer < 1024 px.
- Acceptance: nav items match permission set for current hall; keyboard navigable.

### A6 `/account`
- Own profile (display name, email read-only, avatar from Google), sign out, list of memberships. Action: update display name (`PATCH /profile`). Validation: 1–80 chars.

---

## B. Hall overview & settings

### B1 `/halls/[hallId]` Overview
- Roles: EMP, OWN (`device.view`). Components: KPI cards (devices free/in use/maintenance/offline, active sessions, upcoming reservations next 2 h, outstanding invoices count/total — **owner or `invoice.view` only**), compact live device strip, upcoming reservations list, alerts (offline agents, open shift status).
- Data: `v_hall_overview`, `v_device_live_status`, upcoming reservations. Realtime: devices, sessions, reservations.
- Empty: new hall with no devices → CTA "Add devices" (owner) / "No devices configured" (employee).
- Acceptance: numbers equal backend view values; financial KPI hidden for users without permission and not fetched.
- Tests: C (role variants), E (smoke).

### B2 `/halls/[hallId]/settings` (tabs: Profile · Working hours · Policies · Payments)
- Roles: OWN (`hall.settings.manage`); others → 403.
- Profile: name, address/contact, time zone (IANA select), status read-only (changed by SA).
- Working hours: weekly table, multiple ranges per day, closed days; overnight ranges per DEC-W06.
- Policies: cancellation deadline (minutes), check-in grace (minutes), reminder offset, no-show threshold, waiting list enabled (if approved), deposits optional (§8.3).
- Payments: currency (locked if records exist; changes require SA — ASSUMPTION), enabled methods (cash, wallet; online disabled until DEC-09).
- Dependency: `update_hall_settings`, `set_working_hours` RPCs (audited).
- Validation: Zod; numeric ranges 0–1440; ranges non-overlapping per day.
- Acceptance: save writes audit event (visible in B-audit); defaults displayed as "proposed default" until approved.
- Tests: U (schemas), I (RPC + audit), Z.

---

## C. Devices & Agents

### C1 `/halls/[hallId]/devices` Live device grid
- Roles: EMP, OWN (`device.view`). Components: `DeviceGrid`/`DeviceTable` toggle, `DeviceCard` (name, type icon, operational status, maintenance badge, session timer, next reservation, agent online/offline + last heartbeat), filters (type, status, availability), search.
- Data: `v_device_live_status`; Realtime on devices, sessions, agent status.
- Actions (permission-gated): open device, start walk-in (D2), check-in next reservation, quick command.
- Empty: no devices. Stale: if Realtime disconnected > 30 s show "Live updates paused – refreshing" banner and poll.
- Acceptance: five state dimensions shown distinctly (§7.3); availability label comes from backend.
- Tests: C, E (realtime update reflected after session start).

### C2 `/devices/new`, `/devices/[deviceId]/edit`
- Roles: OWN. Fields: name/number (unique per hall), type (enum, extensible), category, capabilities (checkboxes from backend capability list), active/disabled.
- Dependency: `upsert_device`. No hard delete; "Disable" only.
- Validation: required name ≤ 40 chars; uniqueness error mapped from backend `CONFLICT`.
- Tests: U, I, Z.

### C3 `/devices/[deviceId]` Device detail
- Roles: EMP, OWN. Sections: status panel, current session (link), upcoming reservations, maintenance history, agent binding (id, version, last heartbeat, sync state — no credentials), recent commands.
- Actions: Start/End maintenance (C4), send command (C6) if `device.control`.
- Tests: C.

### C4 Maintenance dialog
- Start: reason, optional expected end. Before confirm, fetch affected future reservations (`preview_maintenance_impact`) and list them; existing sessions/reservations preserved.
- End: confirmation. Both audited with actor.
- Acceptance: warning list shown; device grid updates.
- Tests: I, E.

### C5 `/halls/[hallId]/agents` Agent health
- Roles: OWN, permitted EMP. Table: device, agent version, connection state, last heartbeat (relative + absolute), last successful command, last error, sync state. Filter offline.
- Tests: C.

### C6 Command request dialog
- Commands offered by device capabilities: LOCK, UNLOCK, SHUTDOWN, RESTART, SYNC_STATE. START/END_SESSION issued only through session flows.
- SHUTDOWN/RESTART require typed confirmation and warn if a session is active.
- Dependency: `request_device_command(device_id, type, idempotency_key)`.
- After submit: show command status timeline live (Queued → Sent → Acknowledged → Executed/Failed/Timed out/Canceled). "Timed out" labeled "Outcome unknown" (§15.4).
- Tests: I, Z (employee without `device.control`), E.

### C7 `/halls/[hallId]/commands` Command history
- Filters: device, type, status, requester, date range. Detail drawer: events timeline, response/error (sanitized). Pagination server-side.
- Tests: C, I.

---

## D. Reservations & sessions

### D1 `/halls/[hallId]/reservations` Calendar & queue
- Roles: EMP, OWN (`reservation.view`). Tabs: **Calendar** (rows = devices, columns = time slots in hall TZ; day/week; working hours shaded; maintenance hatched; sessions & reservations as blocks) and **Queue** (today's arrivals ordered by start: customer, device, time, status, grace countdown).
- Filters: date, device type, status. Realtime refresh.
- Actions: check-in (D3), cancel (D4), create (D2b, if permitted).
- Tests: C (render overlapping visuals), E.

### D2 Walk-in session dialog (from devices or sessions page)
- Fields: device (available only, from backend availability), customer (optional lookup/guest per DEC-W09), type fixed/open, duration (fixed), package (optional), notes.
- Pre-submit: price preview from backend (`quote_session`), clearly labeled estimate.
- Dependency: `POST /sessions/walk-in` with idempotency key. Result: session id + command status.
- Errors: `CONFLICT` (upcoming reservation) shows the conflicting reservation.
- Tests: U, I, E.

### D2b Create reservation dialog (staff) — P1, DEC-W05
- Fields: customer (lookup), device or category, date/time, duration. Availability fetched from `GET /halls/{id}/availability`. Backend revalidates.

### D3 Check-in dialog
- Shows reservation, device state, agent state, grace status. If late beyond grace: override toggle visible only with permission; reason mandatory.
- Dependency: `POST /reservations/{id}/check-in` (idempotent). On success navigate to session detail.
- Tests: I (double submit → one session), Z (override without permission), E.

### D4 Cancel reservation dialog
- Reason (required for staff), shows whether past deadline and financial implications returned by backend preview.
- Dependency: `POST /reservations/{id}/cancel`.

### D5 `/reservations/[reservationId]` Detail
- Customer (minimized PII: name, masked contact), device, times, status, events timeline (`reservation_events`), linked session.

### D6 `/halls/[hallId]/waiting-list` (P2)
- Ordered entries, status, claim window expiry. Read-only plus "remove" if policy allows. Blocked by DEC-04.

### D7 `/halls/[hallId]/sessions` Active sessions
- Cards/table: device, customer, type, start, scheduled end/elapsed timer, extension count, agent command status, outstanding indicator.
- Timer: computed from server `started_at`/`scheduled_end_at` and server time offset (fetched once per load); visual only.
- Actions: extend (D8), convert to open, end (D9), apply discount (F-discount), view.

### D8 Extend dialog
- Duration increment; backend preview of conflict/price; reason required.
- Dependency: `POST /sessions/{id}/extend`.

### D9 End session dialog
- End type: normal / interruption / administrative termination (permission per DEC-01) with reason for non-normal.
- Result: invoice summary (Open, outstanding) with "Collect payment" CTA. Never shows "Paid" automatically.
- Tests: I, E.

### D10 `/sessions/history` and `/sessions/[sessionId]`
- History filters: date range, device, type, status, employee. Detail: pricing snapshot (read-only), events, commands, invoice link.

---

## E. Pricing, packages, discounts

### E1 `/halls/[hallId]/pricing`
- Roles: OWN. Rate table: standard, per category, per device override; minimum billable duration, rounding (display of configured rule; options limited to DEC-05 outcome); pricing windows (day-of-week, time range, rate).
- Copy: "Changes apply to sessions started after saving."
- Validation: amounts as decimal input converted to minor units by `money.ts` parse (input conversion only) and re-validated by backend.
- Tests: U (parse), I, Z.

### E2 `/halls/[hallId]/packages`
- CRUD: name, duration, price, device/category restriction, time-of-day restriction, validity, usage limits, active. Duration semantics per DEC-W10. Usage history per package.

### E3 `/halls/[hallId]/discounts`
- CRUD: type (amount/percent), value, scope, eligibility, active period, usage limits. Employee discount authority configured in E (employees).

### E4 Apply discount (session/invoice dialog)
- Choose discount or manual amount (if permitted), reason. Backend returns original/discount/final. Rejected beyond employee limit.

---

## F. Invoices, payments, refunds, adjustments

### F1 `/halls/[hallId]/invoices`
- Roles: `invoice.view`. Columns: number, customer, session/device, date, status, total, paid, outstanding, currency. Quick filters: Outstanding (Open + Partially paid), Paid, Voided. Totals row computed by backend query (not summed in browser).

### F2 `/invoices/[invoiceId]`
- Line items, discounts, package, gross/discount/final, payments list, refunds, adjustments, status history.
- Actions: Collect payment (F3), apply discount (E4), void/write-off (OWN, reason; P1).

### F3 Collect payment dialog
- Method: cash | wallet (enabled methods only). Amount defaults to outstanding (server value); partial allowed only if hall enables it. For wallet: select customer wallet in this hall; balance shown from backend.
- Requires open shift for cash (backend enforces; UI shows "Open a shift first" link).
- Idempotency key per dialog open. Result: refreshed invoice.
- Tests: I (overpay rejected, double submit, wallet insufficient), E.

### F4 `/payments/[paymentId]`
- Method, amount, operator/source, timestamp, provider ref, shift, attempts. Action: Request refund (F5).

### F5 Refund request dialog
- Amount (≤ refundable from backend), reason code (enum), method (original by default; alternative requires reason per DEC-08).
- Dependency: `POST /payments/{id}/refund-request`.

### F6 `/halls/[hallId]/refunds`
- Tabs: Pending approval, History. Approve/Reject with comment (`refund.approve`). Requester cannot approve own request if policy says so (backend).

### F7 `/halls/[hallId]/adjustments`
- List of reversals/adjustments with original references; create adjustment (OWN, `payment.adjust`) with reason and target record. No edit/delete.

---

## G. Wallets

### G1 `/halls/[hallId]/wallets`
- Roles: `wallet.view`. Table: customer, status, balance (backend), currency, last activity. Search by customer.

### G2 `/wallets/[walletId]`
- Balance card, ledger table (type, amount ±, resulting balance, related invoice/payment, actor, status, reversal link). Actions: Top-up (cash, `wallet.top_up`), Withdrawal request (`wallet.withdraw`, P1), Freeze/Unfreeze (OWN, P1).
- Top-up copy: "Stored value — not gaming revenue."
- Tests: I (top-up idempotency, frozen wallet), Z (sales role, other hall wallet id → 404).

---

## H. Shifts, registers, expenses, reports

### H1 `/halls/[hallId]/shifts`
- Current open shift card (mine / hall), list of shifts with status, responsible employee, totals, discrepancy. Action: Open shift (register select if multiple, opening cash).

### H2 `/shifts/[shiftId]`
- Summary from backend: opening cash, cash collections, payouts, adjustments, expected cash; linked payments list.
- Close flow (stepper): (1) Unpaid invoice gate — table from `unpaid-summary` (count, total, device/session, end time, amount, status) with links to collect; (2) Count cash; (3) Review discrepancy; (4) Confirm. If gate unmet: blocked, or override (permission + reason) per DEC-11.
- Tests: I (gate block, override audit), E (full close).

### H3 `/halls/[hallId]/registers` (P1)
- Registers list, cash movements (payout, adjustment) with reason. Model per DEC-W08.

### H4 `/halls/[hallId]/expenses` (P2)
- Expense CRUD with category, amount, method, date, description, receipt upload (Supabase Storage, private bucket, signed URLs), approval status.

### H5 `/halls/[hallId]/reports`
- Roles: `report.financial.view`. Period selector (hall TZ). Basic (P0): sessions summary (count, fixed/open), gross charges, discounts, net billed, collections by method (cash/wallet), refunds, outstanding invoices, wallet top-ups & liability, shift summaries. Advanced (P2): by device/category/employee, discounts by employee, charts.
- Each figure has a definition tooltip (top-ups ≠ revenue, §13.3).
- Export CSV (P1).

---

## I. Employees

### I1 `/halls/[hallId]/employees`
- Members: name, email, role, status, last active. Pending invitations. Action: Invite (email + role template + optional permission overrides).

### I2 `/employees/[membershipId]`
- Role, permission checklist (grouped), discount authority limit, register assignments; Deactivate/Reactivate. Owner cannot modify own owner role (backend rule, ASSUMPTION). Changes audited.

### I3 `/halls/[hallId]/my-activity`
- Employee's own actions from audit log (self-filtered view).

---

## J. Risk, notifications, audit

### J1 `/halls/[hallId]/risks` (P2)
- Table: device, reservation time, risk type, severity, explanation, suggested action, resolution status. Actions link to relevant pages; no automatic changes.

### J2 `/notifications` (P2)
- List, mark read, filter. Toast bridge (P1) for command results and payments.

### J3 `/halls/[hallId]/audit`
- Filters: actor, action, target type, date. Row detail shows safe before/after diff. Read-only; export (P1, audited).

---

## K. Platform administration (`/admin`, SA only)

| Page | Purpose | Data / dependency | Key actions | Notes |
|---|---|---|---|---|
| `/admin` | Platform metrics | tenants/halls counts, agent online %, failed jobs (if exposed) | — | P1 metrics beyond counts |
| `/admin/tenants` | List/search tenants | `tenants` | Create tenant | — |
| `/admin/tenants/[tenantId]` | Tenant detail, halls/branches, owners, sales attribution | `halls`, memberships | Create hall, invite owner, activate/deactivate (reason) | Branch model per DEC-17 |
| `/admin/users` | Accounts & platform roles | profiles, assignments | Assign/revoke platform & sales roles, deactivate | audited |
| `/admin/search` (P2) | Cross-hall search | search RPC | — | each search audited |
| `/admin/monitoring` (P2) | Agent connectivity, command failures, payment discrepancies | monitoring views | — | §23.2 |
| `/admin/settings` (P2) | Platform configuration | platform settings | edit | audited |
| `/admin/audit` | Platform audit | `audit_logs` | filter | — |

Permission-denied: non-SA → 404 for `/admin/*`. SA viewing hall financial pages requires explicit permission (REQ-ADM-04).

## L. Sales (`/sales`, SAG/SAD)

| Page | Roles | Purpose | Actions |
|---|---|---|---|
| `/sales` | SAG, SAD | My leads summary, onboarding pipeline | — |
| `/sales/leads` | SAG (own/assigned), SAD (all) | Lead list, status filter | Create lead |
| `/sales/leads/[leadId]` | SAG, SAD | Lead detail, contact, notes, onboarding submission | Submit for approval / create draft (DEC-16) |
| `/sales/attribution` | SAD | Attributions, disputes | Resolve dispute (audited) |
| `/sales/agents` | SAD | Manage sales agents | Invite/deactivate |
| `/sales/reports` | SAD | Conversion & performance (no financial data) | Export |

Sales pages never show wallet, payment, register, expense, or private financial data (REQ-SALES-05).
