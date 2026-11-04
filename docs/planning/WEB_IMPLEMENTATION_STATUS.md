# Web Implementation Status

Initial tracker generated from `WEB_TASK_BACKLOG.md` on 2026-10-24. **No implementation work has started**; `web/` contains only these planning documents.

Status values: Not started · In progress · Blocked · In review · Done. Update the row in the same PR that changes the task.

## Tasks

| ID | Title | Pri | Est (d) | Status | Blocked by | PR / notes |
|---|---|---|---|---|---|---|
| WEB-001 | Initialize Next.js app | P0 | 0.5 | Done | DEC-W01 ack | |
| WEB-002 | Strict TS, ESLint, Prettier, Husky | P0 | 0.5 | In progress | WEB-001 | Strict TS, ESLint, Prettier done; Husky missing |
| WEB-003 | Vitest + RTL + MSW setup | P0 | 0.5 | In progress | WEB-001 | Vitest + RTL done; MSW not added |
| WEB-004 | Playwright + axe setup | P0 | 0.5 | Not started | WEB-001 | |
| WEB-005 | CI pipeline | P0 | 1 | In progress | WEB-002..004 | .github/workflows/ci.yml written (it was previously described as written but did not exist); not run on GitHub: this folder is not a git repository |
| WEB-006 | Env validation | P0 | 0.5 | Done | WEB-001 | |
| WEB-007 | Local Supabase wiring & type generation | P0 | 1 | Not started | BE-PREREQ-01 | |
| WEB-008 | Logger + Sentry | P0 | 1 | In progress | WEB-006 | Logger + redaction done; Sentry not added |
| WEB-009 | i18n scaffold | P1 | 0.5 | Not started | WEB-001 | |
| UI-001 | Design tokens & theme | P0 | 1 | Done | WEB-001 |  |
| UI-002 | shadcn primitives | P0 | 1 | Done | UI-001 |  |
| UI-003 | App shell: sidebar, topbar, breadcrumbs, skip link | P0 | 2 | In progress | UI-002 | Shell + permission-filtered nav done; not browser-checked for responsive/a11y; hall switcher (UI-010) pending |
| UI-004 | DataTable with server pagination/filter/sort via URL | P0 | 2 | In progress | UI-002 | DataTable + Pagination done; FilterBar not built |
| UI-005 | Empty/Error/Loading/Forbidden components | P0 | 1 | Done | UI-002 |  |
| UI-006 | Money, HallTime, StatusBadge | P0 | 1 | Done | UI-002 |  |
| UI-007 | ConfirmDialog & ReasonDialog | P0 | 0.5 | Done | UI-002 |  |
| UI-008 | Form field components (RHF+Zod) | P0 | 1 | Not started | UI-002 | Not built; react-hook-form installed, hookform resolvers blocked by peer conflict |
| UI-009 | Toast + action-result feedback | P0 | 0.5 | Not started | UI-002, API-001 | Needs toast component |
| UI-010 | Hall switcher | P0 | 0.5 | Not started | AUTH-006 | |
| AUTH-001 | Supabase server/browser clients | P0 | 0.5 | Done | WEB-006 | No service key used |
| AUTH-002 | Middleware session refresh & redirect | P0 | 1 | In progress | AUTH-001 | proxy.ts (Next 16 name for middleware) refreshes session + redirects anonymous; verified with fake Supabase URL only |
| AUTH-003 | Login page | P0 | 0.5 | In progress | AUTH-001, UI-002 | Login page + Google button built; real OAuth untested (no Supabase project) |
| AUTH-004 | OAuth callback + landing resolver | P0 | 1 | In progress | AUTH-003, AUTH-006 | Callback + resolveLanding built and unit-tested; needs real Supabase to verify |
| AUTH-005 | Sign-out (POST) | P0 | 0.5 | Done | AUTH-001 | POST-only; GET returns 405 |
| AUTH-006 | `requireUser` + `get_my_context` loader | P0 | 1 | In progress | BE-PREREQ-03 | requireUser/getMyContext written against proposed get_my_context RPC (BE-PREREQ-03 not built) |
| AUTH-007 | No-access & deactivated handling | P0 | 0.5 | In progress | AUTH-006 | no-access page built; deactivation untested end to end |
| AUTH-008 | Select hall + last-hall restore | P0 | 0.5 | In progress | AUTH-006, UI-010 | select-hall page built; last-hall cookie not done |
| AUTH-009 | Hall guards & `PermissionGate` | P0 | 2 | In progress | AUTH-006, API-003, BE-PREREQ-04 | Guards (404 non-member / 403 no permission / platform 404), PermissionGate, runAuthorized + withPermission built and unit-tested; not run against a live Supabase; forbidden() is an experimental Next feature |
| AUTH-010 | Error/not-found/forbidden boundaries | P0 | 0.5 | In progress | UI-005 | error.tsx and not-found.tsx exist; forbidden handling is the Forbidden component |
| AUTH-011 | Account page | P1 | 0.5 | Not started | AUTH-006 | Account page not built |
| API-001 | ActionResult & error mapping | P0 | 1 | Done | WEB-001 |  |
| API-002 | Idempotency helper | P0 | 0.5 | Done | API-001 |  |
| API-003 | Contracts: permissions, enums | P0 | 0.5 | In progress | WEB-007, DEC-01 | permissions.ts done; enums + generated database.ts not done |
| API-004 | Realtime invalidation hook | P0 | 1.5 | In progress | AUTH-001, BE-PREREQ-10 | Implemented as useHallRealtime (router.refresh) rather than TanStack Query; polling fallback and reconnect refetch tested with mocks |
| API-005 | Query helpers (pagination, filters, keyset) | P0 | 0.5 | Done | UI-004 |  |
| API-006 | MSW handlers for contracts | P0 | 2 (rolling) | Not started | API-001 | |
| HALL-001 | Hall overview page | P0 | 2 | In progress | AUTH-009, BE-PREREQ-05/06 | Overview now shows device availability counts, offline Agents, active sessions, cash-shift status and unpaid invoices, each fetched only with its permission (no revenue KPI yet); unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0013); migration 0013 applied to staging and smoke-tested there (rolled back); never run in a browser |
| HALL-002 | Settings: profile tab | P0 | 1 | In progress | AUTH-009, BE-PREREQ-05 | Built; unit/component tests with mocked RPCs plus backend RPC tests on PGlite; never run in a browser against a real Supabase |
| HALL-003 | Settings: working hours | P0 | 1.5 | In progress | HALL-002 | Built; unit/component tests with mocked RPCs plus backend RPC tests on PGlite; never run in a browser against a real Supabase |
| HALL-004 | Settings: policies | P0 | 1 | In progress | HALL-002, DEC-02/03 | Built; unit/component tests with mocked RPCs plus backend RPC tests on PGlite; never run in a browser against a real Supabase. Defaults are proposals (DEC-02/03/04) |
| HALL-005 | Settings: currency & payment methods | P0 | 0.5 | In progress | HALL-002 | Payment method toggles + partial payments built inside the policies form; currency change deliberately not editable |
| DEV-001 | Device grid/table | P0 | 2 | In progress | UI-004, BE-PREREQ-06 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. Shows operational, maintenance and Agent state; reservation/session dimensions wait for those modules |
| DEV-002 | Device create/edit/disable | P0 | 1.5 | In progress | DEV-001 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase |
| DEV-003 | Device detail | P0 | 1.5 | In progress | DEV-001 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. Current session / upcoming reservations not shown yet |
| DEV-004 | Maintenance start/end with impact preview | P0 | 1.5 | In progress | DEV-003 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. Affected-reservation warning not possible until reservations exist |
| DEV-005 | Realtime device grid | P0 | 1 | In progress | DEV-001, API-004 | useHallRealtime built and unit-tested with a mocked channel; real Supabase Realtime + RLS not verified (BE-PREREQ-10) |
| AGT-001 | Agent health page | P0 | 1 | In progress | BE-PREREQ-09 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase |
| AGT-002 | Command request dialog | P0 | 1.5 | In progress | DEV-003, API-002 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. SHUTDOWN/RESTART need typed confirmation |
| AGT-003 | Command history page | P0 | 1 | In progress | AGT-001 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. Filters: status only (device/type filters exist in RPC, no UI) |
| AGT-004 | Command status timeline (live) | P0 | 1 | In progress | AGT-003, API-004 | Timeline from agent_command_events; TimedOut shown as Outcome unknown; no retry button exists. Never exercised with a real Agent |
| RES-001 | Reservation queue/list | P0 | 1.5 | In progress | UI-004, BE-PREREQ-07 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. Arrivals list + status; no-show shown but the job that sets it is a backend function (expire_no_shows) no scheduler calls yet |
| RES-002 | Calendar device×time grid | P0 | 3 | In progress | RES-001 | Day timeline (device x time, hall time zone, DST-safe); no week view, no working-hours or maintenance shading; not checked at scale |
| RES-003 | Staff create reservation | P1 | 1.5 | In progress | RES-002, DEC-W05 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. Guest name only (no customer lookup) |
| RES-004 | Reservation detail + events | P0 | 1 | In progress | RES-001 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase |
| RES-005 | Check-in dialog | P0 | 1.5 | In progress | RES-004, API-002 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. Idempotent by reservation state in the database |
| RES-006 | Late check-in override | P0 | 0.5 | In progress | RES-005, DEC-03 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. New permission reservation.override_late (owner only, provisional) |
| RES-007 | Cancel reservation | P0 | 1 | In progress | RES-004, DEC-02 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. Past-deadline cancellations are flagged in history, not blocked (assumption; DEC-02) |
| RES-008 | Waiting list view | P2 | 1 | Not started | DEC-04 | |
| SES-001 | Active sessions board + timers | P0 | 2 | In progress | BE-PREREQ-07, API-004 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. Timers use server time; display only |
| SES-002 | Walk-in dialog with quote | P0 | 2 | In progress | SES-001, API-002 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. No price quote yet (finance module); guest name only |
| SES-003 | End session dialog | P0 | 1 | In progress | SES-001 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. Records duration only; no invoice yet |
| SES-004 | Extend session dialog | P0 | 1 | In progress | SES-001 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase |
| SES-005 | Convert to open | P1 | 0.5 | In progress | SES-001 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. Allowed only with no future confirmed reservation (conservative, provisional) |
| SES-006 | Session history | P0 | 1 | In progress | UI-004 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase. Pagination only; no filters yet |
| SES-007 | Session detail (snapshot, events, commands) | P0 | 1 | In progress | SES-006 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; not run in a browser against a real Supabase |
| PRC-001 | Rates editor | P0 | 2 | In progress | BE-PREREQ-11, DEC-05 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; migrations 0007/0008 applied to staging and smoke-tested there (rolled back); never run in a browser; 0009 privilege hardening applied and verified on staging. Rates by hall/category/device; rounding is PROVISIONAL (DEC-05) |
| PRC-002 | Pricing windows | P1 | 1.5 | Built locally (migration 17, not on staging yet) | PRC-001 | Per-weekday time ranges in the hall time zone; per-segment billing; overlaps rejected; snapshot per session |
| PRC-003 | Packages CRUD + usage history | P1 | 2 | Built locally (migration 17, not on staging yet) | BE-PREREQ-11, DEC-W10 | Fixed price for a fixed duration; sold from the start-session dialog; extra time at the regular rate |
| PRC-004 | Discounts CRUD | P1 | 1.5 | Built locally (migration 17, not on staging yet) | BE-PREREQ-11 | Amount or percent, validity, usage limit |
| PRC-005 | Apply discount dialog | P1 | 1 | Built locally (migration 17, not on staging yet) | PRC-004, FIN-002 | Server computes the amount; owner unlimited, employee limited per discount; shows before/discount/after |
| FIN-001 | Invoice list | P0 | 1.5 | In progress | BE-PREREQ-11 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; migrations 0007/0008 applied to staging and smoke-tested there (rolled back); never run in a browser; 0009 privilege hardening applied and verified on staging |
| FIN-002 | Invoice detail | P0 | 1.5 | In progress | FIN-001 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; migrations 0007/0008 applied to staging and smoke-tested there (rolled back); never run in a browser; 0009 privilege hardening applied and verified on staging. No tax/discount lines (DEC-10) |
| FIN-003 | Collect cash payment | P0 | 2 | In progress | FIN-002, ACC-001, API-002 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; migrations 0007/0008 applied to staging and smoke-tested there (rolled back); never run in a browser; 0009 privilege hardening applied and verified on staging. Cash payments now require an open shift and write a cash movement (migration 0010, applied to staging) |
| FIN-004 | Pay from wallet | P0 | 1 | In progress | FIN-003, WAL-001 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; migrations 0007/0008 applied to staging and smoke-tested there (rolled back); never run in a browser; 0009 privilege hardening applied and verified on staging |
| FIN-005 | Payment detail | P0 | 1 | Built locally (migration 18, not on staging yet) | FIN-002 | `/payments/[id]`: method, amount, operator, shift, customer, refunds; linked from the invoice |
| FIN-006 | Refund request | P0 | 1 | In progress | FIN-005, DEC-08 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; migrations 0007/0008 applied to staging and smoke-tested there (rolled back); never run in a browser; 0009 privilege hardening applied and verified on staging |
| FIN-007 | Refunds approval page | P0 | 1.5 | In progress | FIN-006 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; migrations 0007/0008 applied to staging and smoke-tested there (rolled back); never run in a browser; 0009 privilege hardening applied and verified on staging. Requester cannot approve own refund (provisional, DEC-08) |
| FIN-008 | Adjustments/reversals + void/write-off | P0 | 2 | Built locally (migration 18, not on staging yet) | FIN-002 | Void built earlier; write-off (partial or full, reason, append-only) and an `/adjustments` page listing write-offs, discounts and voids |
| FIN-009 | Outstanding invoices view | P0 | 0.5 | In progress | FIN-001 | Filter and overview count built |
| WAL-001 | Wallet list | P0 | 1 | In progress | BE-PREREQ-12 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; migrations 0007/0008 applied to staging and smoke-tested there (rolled back); never run in a browser; 0009 privilege hardening applied and verified on staging. Opening needs exact customer email |
| WAL-002 | Wallet detail & ledger | P0 | 1.5 | In progress | WAL-001 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; migrations 0007/0008 applied to staging and smoke-tested there (rolled back); never run in a browser; 0009 privilege hardening applied and verified on staging |
| WAL-003 | Cash top-up | P0 | 1 | In progress | WAL-002, ACC-001, DEC-06 | Built; web unit/component tests with mocked RPCs plus backend tests on PGlite; migrations 0007/0008 applied to staging and smoke-tested there (rolled back); never run in a browser; 0009 privilege hardening applied and verified on staging. Cash top-up only; DEC-06 methods pending. Top-ups now require an open shift (migration 0010, applied to staging) |
| WAL-004 | Withdrawal request/decision | P1 | 1.5 | Built locally (migration 18, not on staging yet) | WAL-002, DEC-07 | One owner step with a reason (no second approver, see DEC-P16); paid in cash from the open shift |
| WAL-005 | Freeze/unfreeze | P1 | 0.5 | Built locally (migration 18, not on staging yet) | WAL-002 | Owner-only with a reason; a frozen wallet blocks top-up, payment and withdrawal |
| ACC-001 | Shifts list & open shift | P0 | 1.5 | In progress | BE-PREREQ-13 | Built (W9); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0010, 37 shift/report tests); migration 0010 applied to staging and smoke-tested there (rolled back); never run in a browser. One register per hall, one open shift at a time; opening cash typed in hall currency |
| ACC-002 | Shift detail summary | P0 | 1 | In progress | ACC-001 | Built (W9); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0010, 37 shift/report tests); migration 0010 applied to staging and smoke-tested there (rolled back); never run in a browser. All totals and expected cash come from list_shifts |
| ACC-003 | Unpaid-invoice gate step | P0 | 1 | In progress | ACC-002 | Built (W9); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0010, 37 shift/report tests); migration 0010 applied to staging and smoke-tested there (rolled back); never run in a browser. Gate scope (invoices created since the shift opened) is PROVISIONAL, DEC-11 |
| ACC-004 | Close shift stepper + override | P0 | 1.5 | In progress | ACC-003, DEC-11 | Built (W9); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0010, 37 shift/report tests); migration 0010 applied to staging and smoke-tested there (rolled back); never run in a browser. Override needs payment.adjust plus a reason (PROVISIONAL, DEC-11); the discrepancy is computed and shown by the backend after confirm |
| ACC-005 | Registers & cash movements | P1 | 1.5 | In progress | ACC-002, DEC-W08 | Built (W9); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0010, 37 shift/report tests); migration 0010 applied to staging and smoke-tested there (rolled back); never run in a browser. One register per hall (DEC-W08); payouts/adjustments need payment.adjust and a reason |
| ACC-006 | Expenses with receipt upload | P2 | 2 | Built locally (migration 19, not on staging yet) | DEC-15, BE-PREREQ-17 | Owner-only; correct or void (never delete); private `receipts` bucket, one folder per hall and expense; signed links valid for one minute |
| ACC-007 | Basic financial/operational report | P0 | 2 | In progress | BE-PREREQ-13 | Built (W9); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0010, 37 shift/report tests); migration 0010 applied to staging and smoke-tested there (rolled back); never run in a browser. Top-ups reported apart as stored value, not revenue; no discounts/tax lines exist yet (DEC-10) |
| ACC-008 | Advanced reports & charts | P2 | 3 | Built locally (migration 19, not on staging yet) | ACC-007 | `report_breakdown`: per day, device, category, employee, product, discounts by employee, expenses by category, plus expense/discount/write-off totals; drawn as text-labelled bars with no chart library |
| ACC-009 | CSV export | P1 | 0.5 | In progress | ACC-007 | Built: server-generated CSV of the same figures as the screen (minor units + currency, formula-safe); the export is audited BEFORE data is returned; unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0013); migration 0013 applied to staging and smoke-tested there (rolled back); never run in a browser |
| EMP-001 | Employees list | P0 | 1 | In progress | BE-PREREQ-04 | Built; unit/component tests with mocked RPCs plus backend RPC tests on PGlite; never run in a browser against a real Supabase |
| EMP-002 | Invite employee + accept flow | P0 | 2 | In progress | EMP-001, BE-PREREQ-08 | Built; unit/component tests with mocked RPCs plus backend RPC tests on PGlite; never run in a browser against a real Supabase. Invite link is shown once; delivery is manual (no email sending) |
| EMP-003 | Edit role/permissions/discount limit | P0 | 1.5 | In progress | EMP-001, DEC-01 | Built; unit/component tests with mocked RPCs plus backend RPC tests on PGlite; never run in a browser against a real Supabase |
| EMP-004 | Deactivate/reactivate | P0 | 0.5 | In progress | EMP-003 | Built; unit/component tests with mocked RPCs plus backend RPC tests on PGlite; never run in a browser against a real Supabase |
| EMP-005 | My activity | P1 | 0.5 | In progress | AUD-001 | Built: own audit entries only (self-filtered in the database), visible to any active member; unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0013); migration 0013 applied to staging and smoke-tested there (rolled back); never run in a browser |
| AUD-001 | Hall audit log | P0 | 1.5 | In progress | BE-PREREQ-14 | Built; unit/component tests with mocked RPCs plus backend RPC tests on PGlite; never run in a browser against a real Supabase. Filters: all/hall/employee; no actor/date filters yet |
| AUD-002 | Platform audit log | P0 | 0.5 | In progress | AUD-001 | Built (W10); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0011); migration 0011 applied to staging and smoke-tested there (rolled back); never run in a browser |
| NTF-002 | Live event toasts | P1 | 1 | Not started | API-004 | |
| NTF-001 | Notifications page & bell | P2 | 1.5 | Not started | BE notifications | |
| RISK-001 | Risk monitor page | P2 | 2 | Not started | BE risks RPC | |
| ADM-001 | Admin layout & overview | P0 | 1 | In progress | AUTH-009 | Built (W10); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0011); migration 0011 applied to staging and smoke-tested there (rolled back); never run in a browser |
| ADM-002 | Tenants list & create | P0 | 1.5 | In progress | ADM-001, DEC-17 | Built (W10); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0011); migration 0011 applied to staging and smoke-tested there (rolled back); never run in a browser |
| ADM-003 | Tenant detail: halls, owner invitation | P0 | 2 | In progress | ADM-002 | Built (W10); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0011); migration 0011 applied to staging and smoke-tested there (rolled back); never run in a browser |
| ADM-004 | Tenant activation/deactivation | P0 | 0.5 | In progress | ADM-003 | Built (W10); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0011); migration 0011 applied to staging and smoke-tested there (rolled back); never run in a browser |
| ADM-005 | Users & platform roles | P0 | 1.5 | In progress | ADM-001 | Built (W10); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0011); migration 0011 applied to staging and smoke-tested there (rolled back); never run in a browser |
| ADM-006 | Cross-hall search | P2 | 1.5 | In progress | ADM-001 | Built: every search needs a reason and is audited with its text, even with no results; results exclude all hall financial data; unit tests with mocked RPCs plus backend tests on PGlite (migration 0014); migration 0014 applied to staging and smoke-tested there (rolled back); never run in a browser |
| ADM-007 | Monitoring page | P2 | 1.5 | In progress | ADM-001 | Built: per-hall Agent connectivity (5-minute heartbeat threshold, provisional) and command failures; payment discrepancies deliberately NOT shown (a super admin has no hall finance access, REQ-ADM-04); unit tests with mocked RPCs plus backend tests on PGlite (migration 0014); migration 0014 applied to staging and smoke-tested there (rolled back); never run in a browser |
| ADM-008 | Platform settings | P2 | 1 | Not started | ADM-001 | |
| SALES-001 | Sales layout & home | P1 | 1 | In progress | AUTH-009, BE-PREREQ-16 | Built (W10); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0011); migration 0011 applied to staging and smoke-tested there (rolled back); never run in a browser |
| SALES-002 | Leads list | P1 | 1 | In progress | SALES-001 | Built (W10); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0011); migration 0011 applied to staging and smoke-tested there (rolled back); never run in a browser |
| SALES-003 | Lead detail & onboarding submission | P1 | 2 | In progress | SALES-002, DEC-16 | Built (W10); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0011); migration 0011 applied to staging and smoke-tested there (rolled back); never run in a browser. Sales submit a request only; a super admin converts it (DEC-16, provisional) |
| SALES-004 | Assign leads | P1 | 0.5 | In progress | SALES-002 | Built (W10); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0011); migration 0011 applied to staging and smoke-tested there (rolled back); never run in a browser |
| SALES-005 | Attribution & disputes | P1 | 1.5 | In progress | SALES-001 | Built (W10); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0011); migration 0011 applied to staging and smoke-tested there (rolled back); never run in a browser |
| SALES-006 | Manage sales agents | P1 | 1 | In progress | SALES-001 | Built (W10); web unit/component tests with mocked RPCs plus backend tests on PGlite (migration 0011); migration 0011 applied to staging and smoke-tested there (rolled back); never run in a browser |
| SALES-007 | Sales reports | P2 | 1.5 | In progress | SALES-002 | Built: lead pipeline per agent for a period (current status of leads created in it); no financial data; no export; unit tests with mocked RPCs plus backend tests on PGlite (migration 0014); migration 0014 applied to staging and smoke-tested there (rolled back); never run in a browser |
| SEC-001 | Security headers & CSP | P0 | 1 | In progress | WEB-001 | Static headers plus CSP frame-ancestors/base-uri/form-action/object-src; script CSP with nonces still not done (forces dynamic rendering); headers not inspected on a running server |
| SEC-002 | Open-redirect & `next` param protection | P0 | 0.5 | Done | AUTH-003 | safeNext unit-tested |
| SEC-003 | Service-role/secret guard | P0 | 0.5 | In progress | WEB-005 | Automated guard (tests/security/guards.test.ts): no service-role reference in src/env template/built client bundle; also in CI (CI not yet run) |
| SEC-004 | Cross-tenant test suite | P0 | 2 (+rolling) | In progress | AUTH-009, BE-PREREQ-15 | Unit-level cross-tenant matrix (web) + RLS tests on PGlite (backend); no end-to-end run |
| SEC-005 | Server Action hardening | P0 | 0.5 | In progress | API-001 | Guard test: every exported Server Action goes through withPermission/withPlatformRole (one documented exemption); body limit 100kb; Origin check is Next.js built-in, not tested here |
| SEC-006 | PII/token scrubbing | P0 | 0.5 | Not started | WEB-008 | |
| SEC-007 | Pre-pilot security review | P0 | 2 | In progress | W9 done | Working checklist in WEB_PRE_PILOT_SECURITY_REVIEW.md. NOT signed off |
| TEST-001 | Role seed fixtures & auth helpers | P0 | 1.5 | In progress | BE-PREREQ-15 | Web personas in tests/authz/personas.ts mirror backend seed; no real-session fixtures yet |
| TEST-002 | Authorization matrix framework | P0 | 2 | In progress | TEST-001, AUTH-009 | Persona x hall x route matrix + action guard tests (414 cases) run in vitest; integration layer against real Supabase pending |
| TEST-003 | Financial E2E suite (E2E-03..07) | P0 | 3 | Not started | W8, W9 | |
| TEST-004 | Accessibility crawl | P0 | 1 | Not started | WEB-004 | |
| TEST-005 | Performance budgets | P1 | 1 | Not started | DEPLOY-001 | |
| TEST-006 | Reservation/session E2E (E2E-02, 08, 09, 13) | P0 | 2 | Not started | W7 | |
| TEST-007 | Responsive checks | P0 | 1 | Not started | UI-003 | |
| DEPLOY-001 | Vercel project & environments | P0 | 0.5 | Not started | WEB-005 | |
| DEPLOY-002 | OAuth redirect configuration per env | P0 | 0.5 | Not started | BE-PREREQ-02 | |
| DEPLOY-003 | Sentry releases & source maps | P0 | 0.5 | Not started | WEB-008 | |
| DEPLOY-004 | Runbook: deploy, rollback, incident | P0 | 1 | In progress | DEPLOY-001 | Draft only: WEB_RUNBOOK_DRAFT.md; nothing exercised |
| DEPLOY-005 | Pilot release (one hall) | P0 | 1 | Not started | W11 | |
| DEPLOY-006 | Production release | P0 | 1 | Not started | DEPLOY-005 | |

## Backend prerequisites (external to web)

| ID | Status | Notes |
|---|---|---|
| BE-PREREQ-01 | Staging project gaming-hall-saas-staging (eu-central-2) created 2026-10-26 with migrations 0001-0006 applied; local Docker stack still not used | Real-Supabase verification started, see backend/README.md |
| BE-PREREQ-02 | Not done: Google OAuth provider and redirect URLs must be configured by the project owner (steps in backend/README.md) | |
| BE-PREREQ-03 | Built locally, tested on PGlite only | |
| BE-PREREQ-04 | Partly built (tables, RLS, helper, provisional matrix); final matrix pending DEC-01 | |
| BE-PREREQ-05 | Not started (backend/ is empty) | |
| BE-PREREQ-06 | Built locally: devices, maintenance, live status view; tested on PGlite only | |
| BE-PREREQ-07 | Reservations (exclusion constraint), sessions, check-in/cancel/walk-in/end/extend/convert built; pricing snapshot NOT built; tested on PGlite only (no true concurrent connections) | |
| BE-PREREQ-08 | Not started (backend/ is empty) | |
| BE-PREREQ-09 | Command tables + request/list RPCs built; Agent-side protocol (heartbeat/ack) not built | |
| BE-PREREQ-10 | Tables added to supabase_realtime publication (if present); authorization not verified on real Realtime | |
| BE-PREREQ-11 | Migration 0007 written and PGlite-tested (rates, snapshots, invoices, cash payments, void); applied to staging 2026-10-26, exposure + rolled-back smoke test passed | |
| BE-PREREQ-12 | Migration 0008 written and PGlite-tested (wallets, ledger, wallet payments, refunds); applied to staging 2026-10-26, smoke test passed; adjustments/withdrawals not built | |
| BE-PREREQ-13 | Not started (backend/ is empty) | |
| BE-PREREQ-14 | Table + append-only trigger built; no writers yet | |
| BE-PREREQ-15 | Identity/tenancy seed built (backend/supabase/seed.sql) | |
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

## Reference-parity programme (started 2026-10-27)

Owner decisions: match the reference app where it is similar, follow this plan where they conflict, build the plan items that were "Not started", and add the reference's Products feature as a new phase.

| Stage | Scope | Status |
|---|---|---|
| 1 | Migration `20261027000015_public_player_booking` applied to staging; exposure query, privilege query and a rolled-back smoke test re-run | Done (anon executes exactly 5 read-only RPCs; no anon table grants; smoke test left no rows) |
| 2 | Arabic/English + RTL on the staff dashboard; reference layout | In progress. Done: shell, Overview, **Devices, Reservations, Sessions** (pages and components), shared components (confirm dialog, error state, pagination, forbidden, hall times), and Arabic backend error messages (`lib/actions/errorsAr.ts`, applied centrally in `callRpc` and the permission wrappers). **Invoices, Wallets, Refunds, Shifts, Registers, Reports** (finance, with a test that keeps both languages in sync). **Pricing, Employees, Settings, Audit log, Agents, Commands, My activity** (every hall page is now bilingual), **`/admin/*`, `/sales/*`, `/select-hall`, `/invite/*`, `/no-access`** (platform shell with language toggle and log out). Stage 2 is complete apart from the known gaps below. Fixed on the way: the platform shell received icon components from a server layout, which React cannot serialize, so `/admin` and `/sales` could not render in a browser; icons are now passed by name. Known gaps: form validation messages (zod), metadata page titles and the report CSV export (kept English on purpose, as a stable accounting format) are still English |
| 3 | Products (reference feature, not in the original plan) | Done and applied to staging (owner-approved): migration `20261028000016_products_and_session_items.sql` (261 backend tests incl. 11 new); exposure query, privilege query and a rolled-back smoke test re-run on staging (anon still executes exactly the 5 public read RPCs; clients have no write grants; finalize_session_invoice stays internal; smoke test left no rows). Web: products page, add/remove items on running sessions, product lines on the invoice, Arabic/English. Never run in a browser against a real Supabase |
| 4 | Pricing windows (PRC-002), packages (PRC-003), discounts (PRC-004/005) | Built and tested locally (backend 288, web 840+ tests). Migration 17 is **not** applied to staging yet: it waits for approval |
| 5 | Wallet withdraw/freeze (WAL-004/005), adjustments and write-off (FIN-008), payment detail (FIN-005) | Built and tested locally (backend 300, web 870+ tests). Migration 18 is **not** applied to staging yet |
| 6 | Expenses with receipts (ACC-006), advanced reports (ACC-008) | Built and tested locally (backend 310, web 910+ tests). Migration 19 is **not** applied to staging yet. Receipt upload to Storage has not been run against a real Supabase project |

Not selected for now: notifications bell and live toasts (NTF), account page (AUTH-011), hall switcher (UI-010), platform settings (ADM-008), risk monitor (RISK-001).
