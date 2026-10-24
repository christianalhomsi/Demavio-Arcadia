# Web Requirements Traceability

Source: Master Specification v2.0. Priority: **P0** = MVP (§26.1) · **P1** = MVP-adjacent / needed for pilot · **P2** = later (§26.2) or blocked by a pending decision.
Roles: EMP = Hall Employee, OWN = Hall Owner, SA = Super Admin, SAG = Sales Agent, SAD = Sales Administrator, CUS = Customer.
"Tests": U = unit, C = component, I = integration (local Supabase), E = E2E, Z = authz/cross-tenant, A = accessibility.
Task IDs refer to `WEB_TASK_BACKLOG.md`; DEC IDs to `WEB_RISKS_AND_DECISIONS.md`.

## 1. Authentication & account

| ID | Requirement | Pri | Spec | Role | Page/feature | API / DB dependency | Security | Acceptance criteria | Tests | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| REQ-AUTH-01 | Sign in with Google via Supabase Auth; no phone/SMS OTP | P0 | §5.1, §2.3 | all | `/login`, `/auth/callback` | Supabase Auth Google provider | Authorized redirect URLs only | "Continue with Google" completes and lands on correct interface; cancellation returns to `/login` with message | U, E | AUTH-003, AUTH-004 |
| REQ-AUTH-02 | Authentication ≠ authorization: Google login grants no dashboard access by itself | P0 | §5.2 | all | `/no-access` | `get_my_context` | No role ⇒ no data | Customer-only account sees `/no-access`; no hall data requests succeed | Z, E | AUTH-006, AUTH-007 |
| REQ-AUTH-03 | Retrieve/create profile after sign-in (backend) and load roles/permissions | P0 | §5.1, §20.1 | all | `(app)` layout | `profiles`, `get_my_context`, `GET /me/permissions` | Identity from validated session | Profile, platform roles, memberships available to layouts | I | AUTH-006 |
| REQ-AUTH-04 | Validate session on protected operations; expiration and secure sign-out | P0 | §5.3, §24.1 | all | middleware, `/auth/signout` | Supabase session | POST sign-out; cookie cleared | Expired session redirects to login; sign-out invalidates cookie | U, E | AUTH-002, AUTH-005 |
| REQ-AUTH-05 | Deactivated users lose access | P0 | §5.3, §24.1 | all | layouts | `profiles.status` | Server check each request | Deactivated user is signed out and shown `/no-access` | Z, E | AUTH-007 |
| REQ-AUTH-06 | Never trust client-supplied role names or hall IDs | P0 | §5.3, §21.1 | all | guards, actions | RLS, RPC checks | Core | Tampered hallId yields 404/403; no data | Z | AUTH-009, SEC-004 |
| REQ-AUTH-07 | Do not link identities solely by matching email | P0 | §5.3 | all | — (backend config) | Supabase Auth linking settings | — | Documented as backend prerequisite BE-PREREQ-02 | — | (backend) |
| REQ-AUTH-08 | Session restoration (returning user lands in last hall) | P1 | §24.1 | EMP, OWN | `/select-hall` | memberships | last hall stored as preference, revalidated | Returning user goes to last valid hall | E | AUTH-008 |
| REQ-AUTH-09 | Basic profile management | P1 | §20.1 | all | `/account` | `PATCH /profile` | own record only | Name update persists | I | AUTH-011 |

## 2. Tenancy, roles & permissions

| ID | Requirement | Pri | Spec | Role | Page/feature | Dependency | Security | Acceptance | Tests | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| REQ-TEN-01 | Tenant-aware access; user sees only halls with membership | P0 | §3.2 | EMP, OWN | hall layout, switcher | `hall_memberships`, RLS | Core | Hall switcher lists only member halls; direct URL to others → 404 | Z, E | AUTH-008, AUTH-009, UI-010 |
| REQ-TEN-02 | Different relationships per hall (owner in A, employee in B) | P0 | §3.2 | EMP, OWN | permission context per hall | `user_role_assignments` | per-hall evaluation | Nav and actions differ correctly between halls | Z | AUTH-009 |
| REQ-TEN-03 | Role-based navigation | P0 | §4, §28.1 | all | Sidebar | permissions | UX only | Nav shows only permitted modules | C | UI-003, AUTH-009 |
| REQ-TEN-04 | Server-side permission enforcement for every page and action | P0 | §21.1, §28.2 | all | guards, RPC | RLS + RPC | Core | Direct requests without permission fail server-side | Z | AUTH-009, SEC-004, TEST-002 |
| REQ-TEN-05 | Permission identifiers per §4.7, final matrix | P0 | §4.7 | all | `contracts/permissions.ts` | `permissions`, `role_permissions` | — | Union type matches DB seed | U | API-003; DEC-01 |
| REQ-TEN-06 | Employee does not get owner reports, withdrawals, employee admin, platform config | P0 | §4.2 | EMP | all | permissions | Core | Default employee denied these routes/actions | Z | TEST-002 |
| REQ-TEN-07 | Owners never access unrelated tenants or platform secrets | P0 | §4.3 | OWN | all | RLS | Core | Cross-tenant tests pass | Z | SEC-004 |

## 3. Hall & settings

| ID | Requirement | Pri | Spec | Role | Page | Dependency | Security | Acceptance | Tests | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| REQ-HALL-01 | Hall overview dashboard | P0 | §6.2 | EMP, OWN | `/halls/[id]` | `v_hall_overview` | membership | Shows live device counts, active sessions, upcoming reservations, outstanding invoices (owner) | C, E | HALL-001 |
| REQ-HALL-02 | Hall profile: name, location/contact, status, time zone | P0 | §7.1 | OWN | `…/settings` | `halls`, `update_hall_settings` | `hall.settings.manage`, audited | Edits persist and audit event created | I, Z | HALL-002 |
| REQ-HALL-03 | Working hours | P0 | §7.1, §6.2 | OWN | `…/settings/hours` | `hall_working_hours` | audited | Weekly hours editable; validation start<end; overnight handled per DEC-W06 | U, I | HALL-003 |
| REQ-HALL-04 | Reservation/check-in/cancellation policies (grace, deadline, reminders) | P0 | §7.1, §8.3–8.4 | OWN | `…/settings/policies` | `hall_settings` | audited | Values configurable; defaults per approved DEC-02/03/04 | I | HALL-004 |
| REQ-HALL-05 | Currency & payment methods configuration | P0 | §7.1, §11.2 | OWN | `…/settings/payments` | `hall_settings` | audited | Only approved methods selectable; currency change does not alter historical records display | I | HALL-005 |
| REQ-HALL-06 | Historical records keep original currency/amounts | P0 | §7.1 | all | Money display | invoice currency columns | — | Money renders record currency, not hall's current | U | UI-006 |
| REQ-HALL-07 | Inventory (non-device) | P2 | §7.1 | OWN | — | undefined in spec | — | Documented open decision | — | DEC-W07 |

## 4. Devices, maintenance, Agent

| ID | Requirement | Pri | Spec | Role | Page | Dependency | Security | Acceptance | Tests | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| REQ-DEV-01 | Live device grid with distinct states (operational, maintenance, reservation, session, agent connectivity) | P0 | §6.2, §7.2–7.3 | EMP, OWN | `…/devices` | `v_device_live_status`, Realtime | `device.view` | Each state visible separately; effective availability from backend | C, E | DEV-001, DEV-005 |
| REQ-DEV-02 | Device CRUD: name/number, type (PC, console, extensible), capabilities | P0 | §7.2 | OWN | `…/devices/new`, edit | `devices`, `upsert_device` | `hall.settings.manage`, audited | Create/edit/disable; no hard delete with history | I, Z | DEV-002 |
| REQ-DEV-03 | Device detail: current session, upcoming reservations, heartbeat, agent binding | P0 | §7.2 | EMP, OWN | `…/devices/[id]` | `GET /devices/{id}` | `device.view` | All fields shown with hall time zone | C | DEV-003 |
| REQ-DEV-04 | Maintenance start/end with warnings about affected bookings; records actor | P0 | §7.4 | OWN, permitted EMP | device detail | `start_maintenance`, `end_maintenance` | audited | Shows affected future reservations before confirm; history preserved | I, E | DEV-004 |
| REQ-AGT-01 | Agent health view (last heartbeat, version, sync state, errors) | P0 | §15.4, §6.2 | OWN, EMP | `…/agents` | `agents`, latest status | `device.view` | Offline beyond threshold flagged | C | AGT-001 |
| REQ-AGT-02 | Request device commands (START/END via sessions; LOCK, UNLOCK, SHUTDOWN, RESTART, SYNC_STATE) | P0 | §15.2, §20.3 | permitted | device detail | `POST /devices/{id}/commands` | `device.control`, confirmation for SHUTDOWN/RESTART | Command recorded and status shown; no arbitrary payloads | I, Z, E | AGT-002 |
| REQ-AGT-03 | Command history with filters & states (Queued…Canceled) | P0 | §15.4, §26.1 | OWN, permitted EMP | `…/commands` | `agent_commands`, `agent_command_events` | no secrets in payload view | Filter by device/type/status/date; timeline per command | C, I | AGT-003, AGT-004 |
| REQ-AGT-04 | Timeout shown as "uncertain", never as failure; retry only via backend-approved flow | P0 | §15.4, §9.3 | permitted | command detail | command status | — | UI wording distinguishes Timed out vs Failed; retry disabled for non-idempotent | C | AGT-004 |

## 5. Reservations

| ID | Requirement | Pri | Spec | Role | Page | Dependency | Security | Acceptance | Tests | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| REQ-RES-01 | Reservation calendar (device × time) and queue | P0 | §6.2 | EMP, OWN | `…/reservations` | `GET /reservations`, availability | `reservation.view` | Day/week views, filters; times in hall TZ | C, E | RES-001, RES-002 |
| REQ-RES-02 | Staff create reservation on behalf of customer | P1 | §4.7 `reservation.create`, §8.1 | permitted | create dialog | `POST /reservations` | backend validates overlap/hours/maintenance | Conflict returns clear error; no client-side authority | I, E | RES-003; DEC-W05 |
| REQ-RES-03 | Reservation detail with event history | P0 | §8.4, §18.2 | EMP, OWN | `…/reservations/[id]` | `reservation_events` | `reservation.view` | Shows actor and timestamp of each change | C | RES-004 |
| REQ-RES-04 | Check-in creates session transactionally, records staff, dispatches agent command | P0 | §8.3 | permitted | detail / queue | `POST /reservations/{id}/check-in` | `reservation.check_in`, idempotent | Double-click creates one session; result shows session + command status | I, E | RES-005 |
| REQ-RES-05 | Late check-in override requires permission + reason | P0 | §8.3 | permitted | check-in dialog | same RPC with override | audited | Reason mandatory; denied without permission | I, Z | RES-006 |
| REQ-RES-06 | Cancellation records actor, honors deadline, keeps history | P0 | §8.4 | permitted | detail | `POST /reservations/{id}/cancel` | `reservation.cancel` | Past-deadline behavior per DEC-02; reservation remains in history | I, E | RES-007 |
| REQ-RES-07 | No-show status visible (job is backend) | P0 | §8.4, §22 | EMP, OWN | list/detail | status + reason | — | No-show reservations shown with reason | C | RES-001 |
| REQ-RES-08 | Waiting list queue view | P2 | §8.5 | EMP, OWN | `…/waiting-list` | `waiting_list_entries` | — | Deterministic order shown | C | RES-008; DEC-04 |

## 6. Sessions

| ID | Requirement | Pri | Spec | Role | Page | Dependency | Security | Acceptance | Tests | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| REQ-SES-01 | Active sessions with timers (fixed countdown / open elapsed) | P0 | §6.2, §9 | EMP, OWN | `…/sessions` | `v_active_sessions`, Realtime | `session.*` | Timer derived from server times; resyncs on refetch | C, E | SES-001 |
| REQ-SES-02 | Walk-in session (fixed or open) | P0 | §9.1, §20.2 | permitted | walk-in dialog | `POST /sessions/walk-in` | `session.start`, idempotent | One session per intent; conflicts rejected | I, E | SES-002 |
| REQ-SES-03 | End session (normal/interruption/admin termination); triggers invoice finalization, not payment | P0 | §9.4 | permitted | session detail | `POST /sessions/{id}/end` | `session.end` | Result links to invoice in Open state | I, E | SES-003 |
| REQ-SES-04 | Extend session with conflict check, operator and reason | P0 | §9.3 | permitted | extend dialog | `POST /sessions/{id}/extend` | `session.extend` | Conflict error shows conflicting reservation | I, E | SES-004 |
| REQ-SES-05 | Convert fixed to open when allowed | P1 | §9.4 | permitted | detail | `POST /sessions/{id}/convert-to-open` | audited | Rejected when scheduling disallows | I | SES-005 |
| REQ-SES-06 | Session history with filters | P0 | §6.2 | EMP, OWN | `…/sessions/history` | `GET /sessions` | — | Paginated, filter by device/type/date/status | C | SES-006 |
| REQ-SES-07 | Session state separate from Agent command delivery state | P0 | §9.3 | all | detail | session_events + commands | — | Two distinct status indicators | C | SES-007 |

## 7. Pricing, packages, discounts

| ID | Requirement | Pri | Spec | Role | Page | Dependency | Security | Acceptance | Tests | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| REQ-PRC-01 | Configure standard/category/device rates | P0 | §10.1 | OWN | `…/pricing` | `pricing_rules`, RPC | `hall.settings.manage`, audited | Changes apply to new sessions only (shown in UI copy) | I, Z | PRC-001 |
| REQ-PRC-02 | Pricing windows (time-of-day) | P1 | §10.1 | OWN | `…/pricing` | `pricing_windows` | audited | Overlapping windows rejected by backend | I | PRC-002; DEC-05 |
| REQ-PRC-03 | Packages (basic fixed duration/price) | P1 | §14.2 | OWN | `…/packages` | `packages` | audited | CRUD, activation period | I | PRC-003 |
| REQ-PRC-04 | Discount definitions with limits | P1 | §14.1 | OWN | `…/discounts` | `discounts` | audited | Type, value, scope, period, limits | I | PRC-004 |
| REQ-PRC-05 | Apply authorized discount at session/invoice with reason | P1 | §14.1 | permitted | invoice/session | `apply_discount` RPC | permission + employee limit | Original, discount, final amounts shown from server | I, Z | PRC-005 |
| REQ-PRC-06 | Web never recalculates prices; displays snapshots | P0 | §10.2 | all | — | snapshots | Integrity | No pricing math in `src/` beyond formatting | U (lint/grep) | API-003, SEC-007 |

## 8. Invoices, payments, refunds

| ID | Requirement | Pri | Spec | Role | Page | Dependency | Security | Acceptance | Tests | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| REQ-INV-01 | Invoice list with outstanding filter | P0 | §6.2, §11.1 | EMP, OWN | `…/invoices` | `GET /invoices` | `invoice.view` | Filter by status incl. Partially paid | C, E | FIN-001, FIN-009 |
| REQ-INV-02 | Invoice detail: line items, discounts, paid, outstanding, status | P0 | §11.1 | EMP, OWN | `…/invoices/[id]` | `GET /invoices/{id}` | — | All amounts server-provided | C | FIN-002 |
| REQ-INV-03 | Record cash payment (partial if enabled) | P0 | §11.2 | permitted | collect dialog | `POST /invoices/{id}/payments` | `payment.collect`, idempotent, shift-linked | Double submit records one payment; amount > outstanding rejected by backend | I, E | FIN-003 |
| REQ-INV-04 | Pay invoice from hall wallet | P0 | §11.2, §12 | permitted | collect dialog | `POST /wallets/{id}/payments` | idempotent | Insufficient balance error from backend | I, E | FIN-004 |
| REQ-INV-05 | Payment detail incl. method, operator, provider ref | P0 | §11.2 | EMP, OWN | `…/payments/[id]` | `GET /payments/{id}` | — | Shows attempts/failures where present | C | FIN-005 |
| REQ-INV-06 | Refund request with reason code, original reference | P0 | §12.3, §20.3 | permitted | payment detail | `POST /payments/{id}/refund-request` | `refund.request` | Request created in pending state | I, Z | FIN-006 |
| REQ-INV-07 | Refund approval (separate permission) | P0 | §12.3 | OWN | `…/refunds` | `POST /refunds/{id}/approve` | `refund.approve`; requester ≠ approver per DEC-08 | Unauthorized approval fails server-side | I, Z, E | FIN-007 |
| REQ-INV-08 | Adjustments/reversals instead of edits | P0 | §11.3, §19.3 | OWN | `…/adjustments` | `financial_adjustments` RPC | `payment.adjust`, audited | No edit/delete controls on payments | I, Z | FIN-008 |
| REQ-INV-09 | Online payments | P2 | §11.2, §26.2 | — | — | provider | — | Deferred, DEC-09 | — | — |
| REQ-INV-10 | Void / write-off | P1 | §11.1 | OWN | invoice detail | RPC | approval | Requires reason | I | FIN-008 |

## 9. Wallets

| ID | Requirement | Pri | Spec | Role | Page | Dependency | Security | Acceptance | Tests | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| REQ-WAL-01 | Wallet list scoped to hall | P0 | §12.1 | permitted | `…/wallets` | `GET /wallets` | `wallet.view`; sales denied | Only current hall wallets | Z | WAL-001 |
| REQ-WAL-02 | Ledger (append-only) with balances from backend | P0 | §12.2 | permitted | wallet detail | `GET /wallets/{id}/transactions` | — | Reversals linked to originals | C | WAL-002 |
| REQ-WAL-03 | Cash top-up | P0 | §12.1, §12.3 | permitted | top-up dialog | `POST /wallets/{id}/top-ups` | `wallet.top_up`, idempotent | Labeled as liability, not revenue | I, E | WAL-003 |
| REQ-WAL-04 | Withdrawal request/approval | P1 | §12.3 | OWN | wallet detail | `POST /wallets/{id}/withdrawal-requests` | `wallet.withdraw`, limits | Requires reason & approval | I, Z | WAL-004; DEC-07 |
| REQ-WAL-05 | Freeze/disable wallet | P1 | §12.1 | OWN | wallet detail | RPC | audited | Frozen wallet rejects debits (backend) | I | WAL-005 |

## 10. Accounting, shifts, reports

| ID | Requirement | Pri | Spec | Role | Page | Dependency | Security | Acceptance | Tests | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| REQ-ACC-01 | Open shift with opening cash | P0 | §13.1 | permitted | `…/shifts` | `POST /shifts/open` | `shift.open` | One open shift per register/employee rule from backend | I, E | ACC-001 |
| REQ-ACC-02 | Shift detail with linked collections, payouts, adjustments | P0 | §13.1 | permitted | `…/shifts/[id]` | `GET /shifts/{id}` | — | Expected cash from backend | C | ACC-002 |
| REQ-ACC-03 | Unpaid-invoice gate before close | P0 | §13.2 | permitted | close flow | `GET /shifts/{id}/unpaid-summary` | — | Count, total, device/session, end time, amount, status listed | C, E | ACC-003 |
| REQ-ACC-04 | Close shift with counted cash and discrepancy; override needs permission + reason | P0 | §13.1–13.2 | permitted | close flow | `POST /shifts/{id}/close` | `shift.close`, audited | Blocked when gate unmet unless override | I, Z, E | ACC-004; DEC-11 |
| REQ-ACC-05 | Cash registers & movements (payouts, adjustments) | P1 | §13.1 | OWN | `…/registers` | `cash_registers`, `cash_movements` | audited | Register model per DEC-W08 | I | ACC-005 |
| REQ-ACC-06 | Expenses | P2 | §13.3 | OWN | `…/expenses` | `expenses` | approval | Separate from revenue | I | ACC-006; DEC-15 |
| REQ-ACC-07 | Basic operational/financial reports with correct accounting meaning | P0 | §13.3, §26.1 | OWN | `…/reports` | `GET /reports/*` | `report.financial.view` | Top-ups ≠ revenue; categories per §13.3 | C, I | ACC-007 |
| REQ-ACC-08 | Advanced reports (by device/category/employee, discounts by employee) | P2 | §13.3, §26.2 | OWN | `…/reports` | report RPCs | — | — | C | ACC-008 |
| REQ-ACC-09 | Report export (CSV) | P1 | [REC] | OWN | reports | report RPCs | audited export | CSV matches displayed data | I | ACC-009 |

## 11. Employees

| ID | Requirement | Pri | Spec | Role | Page | Dependency | Security | Acceptance | Tests | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| REQ-EMP-01 | List employees & memberships | P0 | §4.3 | OWN | `…/employees` | `hall_memberships` | `employee.manage` | — | C | EMP-001 |
| REQ-EMP-02 | Invite employee (privileged access only via invitation) | P0 | §5.2 | OWN | invite dialog | `invite_member` RPC | audited | Invitee gets access only after accepting & signing in with Google | I, E | EMP-002 |
| REQ-EMP-03 | Edit role/permissions & discount authority | P0 | §4.3, §14.1 | OWN | member detail | `assign_role` RPC | audited; owner cannot grant platform perms | Change audited with before/after | I, Z | EMP-003 |
| REQ-EMP-04 | Deactivate / revoke access | P0 | §5.3 | OWN | member detail | RPC | immediate | Revoked user loses access on next request | Z, E | EMP-004 |
| REQ-EMP-05 | Employee reviews own activity | P1 | §4.2 | EMP | `…/my-activity` | audit view filtered to self | — | Only own events | Z | EMP-005 |

## 12. Risk monitoring, notifications, realtime, audit

| ID | Requirement | Pri | Spec | Role | Page | Dependency | Security | Acceptance | Tests | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| REQ-RISK-01 | Reservation risk monitor (offline agent, maintenance, conflicts, hours changes) with severity & suggested actions; no auto-move | P2 | §16 | EMP, OWN | `…/risks` | `GET /reservations/risks` | — | List computed by backend; action links | C | RISK-001 |
| REQ-RT-01 | Realtime updates for devices, reservations, sessions, agent, payments, invoices, commands; refetch after missed events | P0 | §17.1 | EMP, OWN | live views | Realtime channels | RLS-authorized channels | Reconnect triggers refetch; no state taken from event payload alone | I, E | API-004, DEV-005 |
| REQ-NTF-01 | In-app notification list | P2 | §17.2 | staff | `/notifications` | `notifications` | own only | — | C | NTF-001 |
| REQ-NTF-02 | Live toasts for important events (command result, payment completion) | P1 | §17.1 | staff | shell | Realtime | — | — | C | NTF-002 |
| REQ-AUD-01 | Hall audit log view with filters | P0 | §6.2, §21.3 | OWN | `…/audit` | `audit_logs` | owner of hall | Actor, action, target, time, reason, before/after (safe) | C, Z | AUD-001 |
| REQ-AUD-02 | Platform audit log | P0 | §6.3 | SA | `/admin/audit` | `audit_logs` | SA only | — | Z | AUD-002 |
| REQ-AUD-03 | Every sensitive web-initiated action has an audit event (written by backend) | P0 | §21.3, §24.4 | all | — | RPCs | — | Integration tests assert audit row | I | TEST-003 |

## 13. SaaS administration & sales

| ID | Requirement | Pri | Spec | Role | Page | Dependency | Security | Acceptance | Tests | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| REQ-ADM-01 | Tenant & branch/hall management, provisioning | P0 | §6.3, §4.4 | SA | `/admin/tenants` | `tenants`, `halls` | `platform.tenants.manage` | Create tenant, hall, assign owner (invitation) | I, Z | ADM-002, ADM-003 |
| REQ-ADM-02 | Tenant activation/deactivation | P0 | §6.3 | SA | tenant detail | RPC | audited, reason | Deactivated tenant users lose hall access | I, Z | ADM-004 |
| REQ-ADM-03 | Account & role administration | P0 | §4.4 | SA | `/admin/users` | `user_role_assignments` | audited | — | I, Z | ADM-005 |
| REQ-ADM-04 | Admin cannot silently bypass financial controls | P0 | §4.4 | SA | — | RPCs | Financial RPCs require hall-level permission or audited break-glass | SA without financial perm denied refund approval | Z | TEST-002 |
| REQ-ADM-05 | Platform metrics / operational monitoring | P1 | §6.3, §23.2 | SA | `/admin`, `/admin/monitoring` | metrics views | — | — | C | ADM-001, ADM-007 |
| REQ-ADM-06 | Authorized cross-hall search (audited) | P2 | §6.3 | SA | `/admin/search` | search RPC | audited | — | Z | ADM-006 |
| REQ-ADM-07 | Platform configuration | P2 | §6.3 | SA | `/admin/settings` | `platform_settings` (not in §18 — BE-PREREQ) | audited | — | I | ADM-008 |
| REQ-SALES-01 | Sales agent: leads, onboarding submissions/drafts, status | P1 | §4.5, §6.3 | SAG | `/sales/leads` | `sales_leads` | No financial data | — | I, Z | SALES-002, SALES-003; DEC-16 |
| REQ-SALES-02 | Sales admin: assign leads, manage agents | P1 | §4.6 | SAD | `/sales/agents` | RPCs | — | — | I, Z | SALES-004, SALES-006 |
| REQ-SALES-03 | Sales attribution and disputes | P1 | §4.6, §21.3 | SAD | `/sales/attribution` | `sales_attributions` | audited | — | I | SALES-005 |
| REQ-SALES-04 | Sales performance/conversion reports | P2 | §4.6 | SAD | `/sales/reports` | report RPC | no financial | — | C | SALES-007 |
| REQ-SALES-05 | Sales users never see wallets, registers, payments, expenses, private reports, or hall data from onboarding alone | P0 | §4.5, §6.3, §24.4 | SAG, SAD | all | RLS | Core | All finance routes 404/403 for sales roles | Z | TEST-002 |

## 14. Non-functional & security

| ID | Requirement | Pri | Spec | Acceptance | Tests | Tasks |
|---|---|---|---|---|---|---|
| REQ-SEC-01 | No privileged credentials in browser or web runtime | P0 | §5.3, §21.2 | CI check passes; bundle scan finds no service key | U (CI) | SEC-003 |
| REQ-SEC-02 | Errors never expose secrets/SQL/other tenants' data | P0 | §21.2 | Error mapping tests | U | API-001 |
| REQ-SEC-03 | Idempotency keys on financial/session mutations | P0 | §19.2 | Double-submit tests | I, E | API-002, TEST-003 |
| REQ-SEC-04 | Security headers, CSP, CSRF-safe mutations, open-redirect prevention | P0 | §21 [REC] | Header test; redirect test | U, E | SEC-001, SEC-002 |
| REQ-SEC-05 | Tokens/PII not logged | P0 | §21.2 | Logger/Sentry scrub tests | U | SEC-006 |
| REQ-NFR-01 | Responsive (desktop primary, tablet for front desk, phone usable) | P0 | [REC] | 360/768/1280 checks | E | UI-003, TEST-007 |
| REQ-NFR-02 | Accessibility WCAG 2.2 AA | P0 | [REC] | axe: 0 serious/critical | A | TEST-004 |
| REQ-NFR-03 | Loading, empty, error states on every page | P0 | prompt | Checklist in page inventory | C | UI-005 |
| REQ-NFR-04 | Separate dev/test/staging/prod environments | P0 | §23.1 | Env per Vercel environment | — | DEPLOY-001 |
| REQ-NFR-05 | Monitoring of web errors & auth errors | P0 | §23.2 | Sentry receives tagged events | — | WEB-008, DEPLOY-003 |
| REQ-NFR-06 | Performance: LCP < 2.5 s on staging for dashboard pages | P1 | [REC] | Lighthouse CI | — | TEST-005 |

## 15. Out of scope for this application

| Spec item | Section | Owner app |
|---|---|---|
| Customer app screens (discovery, booking, wallet view, invoices for players) | §6.1, §4.1 | Flutter mobile |
| Customer waiting-list claim (`POST /waiting-list/{id}/claim`) | §8.5 | Flutter mobile + backend |
| Push notifications (FCM/iOS) | §17.2 | backend + mobile |
| Agent registration, heartbeat sending, command execution, offline timing, updates | §15, §23.3 | Windows Agent + backend |
| `POST /agents/{id}/heartbeat`, `/command-acknowledgements` | §20.3 | Agent ↔ backend |
| Background jobs (reminders, no-show, expiry, reconciliation, heartbeat monitor) | §22 | backend workers |
| Pricing/invoice calculation, ledger, balances, overlap prevention | §10–12, §8.2 | backend (DB) |
| Online payment provider integration & callbacks | §11.2–11.3 | backend (later) |
| Backups, migrations, restore tests | §23 | backend/ops |
| Optional customer-facing web pages | §2.1 | Web — deferred (DEC-W03) |
