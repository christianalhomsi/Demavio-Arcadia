# Web Implementation Status

Initial tracker generated from `WEB_TASK_BACKLOG.md` on 2026-10-24. **No implementation work has started**; `web/` contains only these planning documents.

Status values: Not started · In progress · Blocked · In review · Done. Update the row in the same PR that changes the task.

## Tasks

| ID | Title | Pri | Est (d) | Status | Blocked by | PR / notes |
|---|---|---|---|---|---|---|
| WEB-001 | Initialize Next.js app | P0 | 0.5 | Not started | DEC-W01 ack | |
| WEB-002 | Strict TS, ESLint, Prettier, Husky | P0 | 0.5 | Not started | WEB-001 | |
| WEB-003 | Vitest + RTL + MSW setup | P0 | 0.5 | Not started | WEB-001 | |
| WEB-004 | Playwright + axe setup | P0 | 0.5 | Not started | WEB-001 | |
| WEB-005 | CI pipeline | P0 | 1 | Not started | WEB-002..004 | |
| WEB-006 | Env validation | P0 | 0.5 | Not started | WEB-001 | |
| WEB-007 | Local Supabase wiring & type generation | P0 | 1 | Not started | BE-PREREQ-01 | |
| WEB-008 | Logger + Sentry | P0 | 1 | Not started | WEB-006 | |
| WEB-009 | i18n scaffold | P1 | 0.5 | Not started | WEB-001 | |
| UI-001 | Design tokens & theme | P0 | 1 | Not started | WEB-001 | |
| UI-002 | shadcn primitives | P0 | 1 | Not started | UI-001 | |
| UI-003 | App shell: sidebar, topbar, breadcrumbs, skip link | P0 | 2 | Not started | UI-002 | |
| UI-004 | DataTable with server pagination/filter/sort via URL | P0 | 2 | Not started | UI-002 | |
| UI-005 | Empty/Error/Loading/Forbidden components | P0 | 1 | Not started | UI-002 | |
| UI-006 | Money, HallTime, StatusBadge | P0 | 1 | Not started | UI-002 | |
| UI-007 | ConfirmDialog & ReasonDialog | P0 | 0.5 | Not started | UI-002 | |
| UI-008 | Form field components (RHF+Zod) | P0 | 1 | Not started | UI-002 | |
| UI-009 | Toast + action-result feedback | P0 | 0.5 | Not started | UI-002, API-001 | |
| UI-010 | Hall switcher | P0 | 0.5 | Not started | AUTH-006 | |
| AUTH-001 | Supabase server/browser clients | P0 | 0.5 | Not started | WEB-006 | |
| AUTH-002 | Middleware session refresh & redirect | P0 | 1 | Not started | AUTH-001 | |
| AUTH-003 | Login page | P0 | 0.5 | Not started | AUTH-001, UI-002 | |
| AUTH-004 | OAuth callback + landing resolver | P0 | 1 | Not started | AUTH-003, AUTH-006 | |
| AUTH-005 | Sign-out (POST) | P0 | 0.5 | Not started | AUTH-001 | |
| AUTH-006 | `requireUser` + `get_my_context` loader | P0 | 1 | Not started | BE-PREREQ-03 | |
| AUTH-007 | No-access & deactivated handling | P0 | 0.5 | Not started | AUTH-006 | |
| AUTH-008 | Select hall + last-hall restore | P0 | 0.5 | Not started | AUTH-006, UI-010 | |
| AUTH-009 | Hall guards & `PermissionGate` | P0 | 2 | Not started | AUTH-006, API-003, BE-PREREQ-04 | |
| AUTH-010 | Error/not-found/forbidden boundaries | P0 | 0.5 | Not started | UI-005 | |
| AUTH-011 | Account page | P1 | 0.5 | Not started | AUTH-006 | |
| API-001 | ActionResult & error mapping | P0 | 1 | Not started | WEB-001 | |
| API-002 | Idempotency helper | P0 | 0.5 | Not started | API-001 | |
| API-003 | Contracts: permissions, enums | P0 | 0.5 | Not started | WEB-007, DEC-01 | |
| API-004 | Realtime invalidation hook | P0 | 1.5 | Not started | AUTH-001, BE-PREREQ-10 | |
| API-005 | Query helpers (pagination, filters, keyset) | P0 | 0.5 | Not started | UI-004 | |
| API-006 | MSW handlers for contracts | P0 | 2 (rolling) | Not started | API-001 | |
| HALL-001 | Hall overview page | P0 | 2 | Not started | AUTH-009, BE-PREREQ-05/06 | |
| HALL-002 | Settings: profile tab | P0 | 1 | Not started | AUTH-009, BE-PREREQ-05 | |
| HALL-003 | Settings: working hours | P0 | 1.5 | Not started | HALL-002 | |
| HALL-004 | Settings: policies | P0 | 1 | Not started | HALL-002, DEC-02/03 | |
| HALL-005 | Settings: currency & payment methods | P0 | 0.5 | Not started | HALL-002 | |
| DEV-001 | Device grid/table | P0 | 2 | Not started | UI-004, BE-PREREQ-06 | |
| DEV-002 | Device create/edit/disable | P0 | 1.5 | Not started | DEV-001 | |
| DEV-003 | Device detail | P0 | 1.5 | Not started | DEV-001 | |
| DEV-004 | Maintenance start/end with impact preview | P0 | 1.5 | Not started | DEV-003 | |
| DEV-005 | Realtime device grid | P0 | 1 | Not started | DEV-001, API-004 | |
| AGT-001 | Agent health page | P0 | 1 | Not started | BE-PREREQ-09 | |
| AGT-002 | Command request dialog | P0 | 1.5 | Not started | DEV-003, API-002 | |
| AGT-003 | Command history page | P0 | 1 | Not started | AGT-001 | |
| AGT-004 | Command status timeline (live) | P0 | 1 | Not started | AGT-003, API-004 | |
| RES-001 | Reservation queue/list | P0 | 1.5 | Not started | UI-004, BE-PREREQ-07 | |
| RES-002 | Calendar device×time grid | P0 | 3 | Not started | RES-001 | |
| RES-003 | Staff create reservation | P1 | 1.5 | Not started | RES-002, DEC-W05 | |
| RES-004 | Reservation detail + events | P0 | 1 | Not started | RES-001 | |
| RES-005 | Check-in dialog | P0 | 1.5 | Not started | RES-004, API-002 | |
| RES-006 | Late check-in override | P0 | 0.5 | Not started | RES-005, DEC-03 | |
| RES-007 | Cancel reservation | P0 | 1 | Not started | RES-004, DEC-02 | |
| RES-008 | Waiting list view | P2 | 1 | Not started | DEC-04 | |
| SES-001 | Active sessions board + timers | P0 | 2 | Not started | BE-PREREQ-07, API-004 | |
| SES-002 | Walk-in dialog with quote | P0 | 2 | Not started | SES-001, API-002 | |
| SES-003 | End session dialog | P0 | 1 | Not started | SES-001 | |
| SES-004 | Extend session dialog | P0 | 1 | Not started | SES-001 | |
| SES-005 | Convert to open | P1 | 0.5 | Not started | SES-001 | |
| SES-006 | Session history | P0 | 1 | Not started | UI-004 | |
| SES-007 | Session detail (snapshot, events, commands) | P0 | 1 | Not started | SES-006 | |
| PRC-001 | Rates editor | P0 | 2 | Not started | BE-PREREQ-11, DEC-05 | |
| PRC-002 | Pricing windows | P1 | 1.5 | Not started | PRC-001 | |
| PRC-003 | Packages CRUD + usage history | P1 | 2 | Not started | BE-PREREQ-11, DEC-W10 | |
| PRC-004 | Discounts CRUD | P1 | 1.5 | Not started | BE-PREREQ-11 | |
| PRC-005 | Apply discount dialog | P1 | 1 | Not started | PRC-004, FIN-002 | |
| FIN-001 | Invoice list | P0 | 1.5 | Not started | BE-PREREQ-11 | |
| FIN-002 | Invoice detail | P0 | 1.5 | Not started | FIN-001 | |
| FIN-003 | Collect cash payment | P0 | 2 | Not started | FIN-002, ACC-001, API-002 | |
| FIN-004 | Pay from wallet | P0 | 1 | Not started | FIN-003, WAL-001 | |
| FIN-005 | Payment detail | P0 | 1 | Not started | FIN-002 | |
| FIN-006 | Refund request | P0 | 1 | Not started | FIN-005, DEC-08 | |
| FIN-007 | Refunds approval page | P0 | 1.5 | Not started | FIN-006 | |
| FIN-008 | Adjustments/reversals + void/write-off | P0 | 2 | Not started | FIN-002 | |
| FIN-009 | Outstanding invoices view | P0 | 0.5 | Not started | FIN-001 | |
| WAL-001 | Wallet list | P0 | 1 | Not started | BE-PREREQ-12 | |
| WAL-002 | Wallet detail & ledger | P0 | 1.5 | Not started | WAL-001 | |
| WAL-003 | Cash top-up | P0 | 1 | Not started | WAL-002, ACC-001, DEC-06 | |
| WAL-004 | Withdrawal request/decision | P1 | 1.5 | Not started | WAL-002, DEC-07 | |
| WAL-005 | Freeze/unfreeze | P1 | 0.5 | Not started | WAL-002 | |
| ACC-001 | Shifts list & open shift | P0 | 1.5 | Not started | BE-PREREQ-13 | |
| ACC-002 | Shift detail summary | P0 | 1 | Not started | ACC-001 | |
| ACC-003 | Unpaid-invoice gate step | P0 | 1 | Not started | ACC-002 | |
| ACC-004 | Close shift stepper + override | P0 | 1.5 | Not started | ACC-003, DEC-11 | |
| ACC-005 | Registers & cash movements | P1 | 1.5 | Not started | ACC-002, DEC-W08 | |
| ACC-006 | Expenses with receipt upload | P2 | 2 | Not started | DEC-15, BE-PREREQ-17 | |
| ACC-007 | Basic financial/operational report | P0 | 2 | Not started | BE-PREREQ-13 | |
| ACC-008 | Advanced reports & charts | P2 | 3 | Not started | ACC-007 | |
| ACC-009 | CSV export | P1 | 0.5 | Not started | ACC-007 | |
| EMP-001 | Employees list | P0 | 1 | Not started | BE-PREREQ-04 | |
| EMP-002 | Invite employee + accept flow | P0 | 2 | Not started | EMP-001, BE-PREREQ-08 | |
| EMP-003 | Edit role/permissions/discount limit | P0 | 1.5 | Not started | EMP-001, DEC-01 | |
| EMP-004 | Deactivate/reactivate | P0 | 0.5 | Not started | EMP-003 | |
| EMP-005 | My activity | P1 | 0.5 | Not started | AUD-001 | |
| AUD-001 | Hall audit log | P0 | 1.5 | Not started | BE-PREREQ-14 | |
| AUD-002 | Platform audit log | P0 | 0.5 | Not started | AUD-001 | |
| NTF-002 | Live event toasts | P1 | 1 | Not started | API-004 | |
| NTF-001 | Notifications page & bell | P2 | 1.5 | Not started | BE notifications | |
| RISK-001 | Risk monitor page | P2 | 2 | Not started | BE risks RPC | |
| ADM-001 | Admin layout & overview | P0 | 1 | Not started | AUTH-009 | |
| ADM-002 | Tenants list & create | P0 | 1.5 | Not started | ADM-001, DEC-17 | |
| ADM-003 | Tenant detail: halls, owner invitation | P0 | 2 | Not started | ADM-002 | |
| ADM-004 | Tenant activation/deactivation | P0 | 0.5 | Not started | ADM-003 | |
| ADM-005 | Users & platform roles | P0 | 1.5 | Not started | ADM-001 | |
| ADM-006 | Cross-hall search | P2 | 1.5 | Not started | ADM-001 | |
| ADM-007 | Monitoring page | P2 | 1.5 | Not started | ADM-001 | |
| ADM-008 | Platform settings | P2 | 1 | Not started | ADM-001 | |
| SALES-001 | Sales layout & home | P1 | 1 | Not started | AUTH-009, BE-PREREQ-16 | |
| SALES-002 | Leads list | P1 | 1 | Not started | SALES-001 | |
| SALES-003 | Lead detail & onboarding submission | P1 | 2 | Not started | SALES-002, DEC-16 | |
| SALES-004 | Assign leads | P1 | 0.5 | Not started | SALES-002 | |
| SALES-005 | Attribution & disputes | P1 | 1.5 | Not started | SALES-001 | |
| SALES-006 | Manage sales agents | P1 | 1 | Not started | SALES-001 | |
| SALES-007 | Sales reports | P2 | 1.5 | Not started | SALES-002 | |
| SEC-001 | Security headers & CSP | P0 | 1 | Not started | WEB-001 | |
| SEC-002 | Open-redirect & `next` param protection | P0 | 0.5 | Not started | AUTH-003 | |
| SEC-003 | Service-role/secret guard | P0 | 0.5 | Not started | WEB-005 | |
| SEC-004 | Cross-tenant test suite | P0 | 2 (+rolling) | Not started | AUTH-009, BE-PREREQ-15 | |
| SEC-005 | Server Action hardening | P0 | 0.5 | Not started | API-001 | |
| SEC-006 | PII/token scrubbing | P0 | 0.5 | Not started | WEB-008 | |
| SEC-007 | Pre-pilot security review | P0 | 2 | Not started | W9 done | |
| TEST-001 | Role seed fixtures & auth helpers | P0 | 1.5 | Not started | BE-PREREQ-15 | |
| TEST-002 | Authorization matrix framework | P0 | 2 | Not started | TEST-001, AUTH-009 | |
| TEST-003 | Financial E2E suite (E2E-03..07) | P0 | 3 | Not started | W8, W9 | |
| TEST-004 | Accessibility crawl | P0 | 1 | Not started | WEB-004 | |
| TEST-005 | Performance budgets | P1 | 1 | Not started | DEPLOY-001 | |
| TEST-006 | Reservation/session E2E (E2E-02, 08, 09, 13) | P0 | 2 | Not started | W7 | |
| TEST-007 | Responsive checks | P0 | 1 | Not started | UI-003 | |
| DEPLOY-001 | Vercel project & environments | P0 | 0.5 | Not started | WEB-005 | |
| DEPLOY-002 | OAuth redirect configuration per env | P0 | 0.5 | Not started | BE-PREREQ-02 | |
| DEPLOY-003 | Sentry releases & source maps | P0 | 0.5 | Not started | WEB-008 | |
| DEPLOY-004 | Runbook: deploy, rollback, incident | P0 | 1 | Not started | DEPLOY-001 | |
| DEPLOY-005 | Pilot release (one hall) | P0 | 1 | Not started | W11 | |
| DEPLOY-006 | Production release | P0 | 1 | Not started | DEPLOY-005 | |

## Backend prerequisites (external to web)

| ID | Status | Notes |
|---|---|---|
| BE-PREREQ-01 | Not started (backend/ is empty) | |
| BE-PREREQ-02 | Not started (backend/ is empty) | |
| BE-PREREQ-03 | Not started (backend/ is empty) | |
| BE-PREREQ-04 | Not started (backend/ is empty) | |
| BE-PREREQ-05 | Not started (backend/ is empty) | |
| BE-PREREQ-06 | Not started (backend/ is empty) | |
| BE-PREREQ-07 | Not started (backend/ is empty) | |
| BE-PREREQ-08 | Not started (backend/ is empty) | |
| BE-PREREQ-09 | Not started (backend/ is empty) | |
| BE-PREREQ-10 | Not started (backend/ is empty) | |
| BE-PREREQ-11 | Not started (backend/ is empty) | |
| BE-PREREQ-12 | Not started (backend/ is empty) | |
| BE-PREREQ-13 | Not started (backend/ is empty) | |
| BE-PREREQ-14 | Not started (backend/ is empty) | |
| BE-PREREQ-15 | Not started (backend/ is empty) | |
| BE-PREREQ-16 | Not started (backend/ is empty) | |
| BE-PREREQ-17 | Not started (backend/ is empty) | |

## Decisions

| ID | Status | Owner | Due |
|---|---|---|---|
| DEC-01 | Open | | |
| DEC-02 | Open | | |
| DEC-03 | Open | | |
| DEC-04 | Open | | |
| DEC-05 | Open | | |
| DEC-06 | Open | | |
| DEC-07 | Open | | |
| DEC-08 | Open | | |
| DEC-09 | Open | | |
| DEC-10 | Open | | |
| DEC-11 | Open | | |
| DEC-12 | Open | | |
| DEC-13 | Open | | |
| DEC-14 | Open | | |
| DEC-15 | Open | | |
| DEC-16 | Open | | |
| DEC-17 | Open | | |
| DEC-W01 | Open (working assumption recorded) | | |
| DEC-W02 | Open (working assumption recorded) | | |
| DEC-W03 | Open (working assumption recorded) | | |
| DEC-W04 | Open (working assumption recorded) | | |
| DEC-W05 | Open (working assumption recorded) | | |
| DEC-W06 | Open (working assumption recorded) | | |
| DEC-W07 | Open (working assumption recorded) | | |
| DEC-W08 | Open (working assumption recorded) | | |
| DEC-W09 | Open (working assumption recorded) | | |
| DEC-W10 | Open (working assumption recorded) | | |
| DEC-W11 | Open (working assumption recorded) | | |
| DEC-W12 | Open (working assumption recorded) | | |
