# Web Risks, Assumptions & Decisions

## 1. Architecture decision records (web)

| ID | Decision | Status | Rationale |
|---|---|---|---|
| ADR-001 | Next.js App Router + TypeScript + Tailwind + Lucide on Vercel | Confirmed by spec §2.1 | — |
| ADR-002 | Supabase Auth with Google only, cookie sessions via `@supabase/ssr` | Confirmed §2.3, §5 | Server-validated sessions across RSC/actions |
| ADR-003 | Reads via RLS views with user JWT; mutations via Postgres RPCs called from Server Actions | Proposed | DB is authority (§1.3, §29); avoids duplicated logic in Next.js |
| ADR-004 | No service-role key in the web runtime | Proposed (strong) | §5.3, §21.2; privileged work belongs to backend |
| ADR-005 | Idempotency key generated per user intent in the browser, enforced in DB | Proposed | §19.2 |
| ADR-006 | Realtime = invalidation only; refetch authoritative state | Confirmed §17.1 | — |
| ADR-007 | shadcn/ui + TanStack Table + RHF + Zod + Recharts; no global state library | Proposed | Minimal dependencies |
| ADR-008 | Hall scoping in URL (`/halls/[hallId]/…`) | Proposed | Multi-hall users (§3.2), shareable links, explicit scope |
| ADR-009 | Non-member hall access returns 404; member without permission returns 403 | Proposed | Avoid hall enumeration |
| ADR-010 | Browser timers are display-only, computed from server timestamps | Confirmed §22 | — |

## 2. Spec decisions still requiring approval (§27) and their web impact

| ID | Decision (§27) | Web impact | Blocks |
|---|---|---|---|
| DEC-01 | Final role/permission matrix (§4.7) | Nav, guards, authz test matrix | W4 (critical) |
| DEC-02 | Cancellation deadline | Cancel dialog messaging, settings default | RES-007 copy |
| DEC-03 | Check-in grace period (10 min proposed) | Queue countdown, override flow | RES-005/006 |
| DEC-04 | Waiting list scope & claim window | Waiting-list page exists or not | RES-008 (P2) |
| DEC-05 | Pricing: partial hours, rounding, night rates, extensions | Pricing form fields | PRC-001/002 |
| DEC-06 | Wallet funding methods & reconciliation | Top-up method options | WAL-003 |
| DEC-07 | Customer withdrawals & approval limits | Withdrawal UI | WAL-004 |
| DEC-08 | Refund methods & alternatives; requester ≠ approver | Refund dialogs | FIN-006/007 |
| DEC-09 | Online payment provider | Online method hidden until decided | P2 |
| DEC-10 | Tax & accounting rules | Invoice tax lines, report categories | FIN-002, ACC-007 |
| DEC-11 | Shift closure gate & overrides | Close stepper behavior | ACC-004 |
| DEC-12 | Agent offline behavior | Command dialog warnings | AGT-002 |
| DEC-13 | Waiting-list claim window | — (mobile/backend) | — |
| DEC-14 | Email OTP fallback | Login page variant | none (Google only for now) |
| DEC-15 | Accounting depth (operational vs double-entry); expenses approval | Expenses/reports scope | ACC-006/008 |
| DEC-16 | Sales workflow: draft hall vs submission only | Lead detail actions | SALES-003 |
| DEC-17 | Tenant/owner/branch structure | Admin tenant pages, hall switcher grouping | ADM-002/003 |

## 3. Web-specific open questions

| ID | Question | Working assumption |
|---|---|---|
| DEC-W01 | Who owns backend contracts and naming? | Backend owner confirms; web uses this document's proposal |
| DEC-W02 | UI language(s) / RTL needed? | English first, i18n scaffold ready; RTL-safe CSS (logical properties) |
| DEC-W03 | Optional customer-facing web pages (§2.1) | Deferred; not in MVP |
| DEC-W04 | Brand/visual identity | Neutral dark-capable theme; tokens replaceable |
| DEC-W05 | Can staff create advance reservations for customers from the web? (`reservation.create` exists in §4.7; §6.2 lists calendar/queue) | Yes, P1, behind permission |
| DEC-W06 | Working hours crossing midnight | Supported as ranges with end < start meaning next day; confirm |
| DEC-W07 | "Inventory" in §7.1 — devices only or consumables? | Devices only; consumables out of scope |
| DEC-W08 | Register model: per hall, per drawer, per shift (§13.1) | One register per hall in MVP |
| DEC-W09 | Walk-in without a registered customer (guest)? | Allowed as guest session; wallet payment unavailable for guests |
| DEC-W10 | Package duration semantics (§14.2) | Wall-clock fixed duration in MVP |
| DEC-W11 | Super admin access to hall financial data | Read-only with audited access; no mutations unless granted hall permission |
| DEC-W12 | Data retention / customer PII shown to staff | Show name + masked contact |

## 4. Assumptions (explicit)

1. `web/` is the dedicated web project; planning docs live in `web/docs/planning/`.
2. Tenant → many halls (halls act as branches) until DEC-17.
3. One currency per hall; records carry their own currency.
4. Desktop/tablet are primary form factors for staff; phone is supported but secondary.
5. GitHub + GitHub Actions for CI; Vercel for hosting.
6. The Windows Agent may not exist during web development; command flows are tested with a backend stub that advances command states.

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-01 | Backend not yet started — web blocked on contracts | High | High | Contract-first (this doc set), MSW mocks, parallel backend plan; phases gated on BE-PREREQ |
| R-02 | Permission matrix undecided → rework of guards/tests | High | High | Data-driven permissions (no hard-coded role checks); DEC-01 in W0 |
| R-03 | Frontend accidentally becomes source of truth for money | Medium | Critical | ADR-003/004, lint rule, review checklist, tests asserting backend values |
| R-04 | Realtime authorization leaks cross-hall events | Medium | High | Private channels with RLS; payloads as invalidation only; Z test |
| R-05 | Time-zone bugs in calendar/reports | Medium | Medium | Hall TZ helper, DST unit tests |
| R-06 | Duplicate financial actions from retries | Medium | Critical | Idempotency keys + E2E-05 |
| R-07 | Calendar complexity/performance | Medium | Medium | Custom lightweight grid, virtualization, scope to day/week |
| R-08 | Google OAuth misconfiguration across envs | Medium | Medium | DEPLOY-002 checklist per environment |
| R-09 | Scope creep (advanced reports, waiting list, online payments) | Medium | Medium | MVP boundary in milestones doc |
| R-10 | Agent unavailable for integration testing | High | Medium | Command stub; pilot with real Agent in W11 |
| R-11 | Pending tax/accounting rules change report definitions | Medium | Medium | Reports render backend-defined categories; definitions in tooltips from config |
