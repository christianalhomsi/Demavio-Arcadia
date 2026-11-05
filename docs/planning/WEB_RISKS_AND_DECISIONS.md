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
| DEC-12 | Agent offline behavior — **Resolved** (planning): see [windows-agent/WINDOWS_AGENT_OFFLINE_AND_RECOVERY.md](windows-agent/WINDOWS_AGENT_OFFLINE_AND_RECOVERY.md) and decisions WA-D11–D14 | Command dialog warnings; offline banner; conflict queue | AGT-002, AGT-107, AGT-112 |
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
| DEC-W13 | Which shift receives cash (W9, PROVISIONAL, implemented in migration 0010) | All cash payments, cash top-ups and approved cash refunds go to the hall's single open shift, whoever collects. With no open shift they are refused (`no_open_shift`). Wallet payments never touch the drawer. Alternative: per-employee drawers |
| DEC-W14 | Shift close gate and override (W9, PROVISIONAL, refines DEC-11) | Gate = unpaid (open/partially paid, not voided) invoices created since the shift opened; older unpaid invoices are listed but do not block. Override needs `payment.adjust` (owner by default) plus a 3–300 character reason and is audited. A counted-vs-expected difference never blocks closing; it is stored and reported. Payouts and adjustments need `payment.adjust`, a reason, and cannot take the drawer below zero |
| DEC-W15 | Report accounting meaning (W9, PROVISIONAL, refines DEC-10/DEC-15) | Operational (not double-entry). Invoiced = non-voided invoices created in the period (revenue measure); collections by method; refunds and voids shown apart, never silently netted; wallet top-ups are stored value (a liability) and wallet payments settle it, so neither is new revenue; outstanding and wallet liability are as-of-now snapshots; periods are half-open `[from, to)` in the hall's time zone, max 366 days |
| DEC-W16 | Platform admin and sales workflow (W10, PROVISIONAL, implemented in migration 0011; refines DEC-16/DEC-17) | Tenant → many halls. A tenant's first owner comes from a hall invitation created by a super admin (link shown once). Sales submit an onboarding REQUEST on a lead; a super admin approves it, which creates tenant + hall + owner invitation + an attribution to the lead's agent (assigned agent, else creator). Super admin has no hall financial permissions and sees no sales leads except submitted onboarding requests. Sales admin may assign/revoke only `sales_agent`; only a super admin manages `super_admin`/`sales_admin` roles and user status; the last super admin and your own super_admin role cannot be revoked. Any sales user may dispute an attribution; only a sales admin resolves it (with a note; may reassign). "Agents online" = heartbeat in the last 5 minutes |
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

## 6. Decisions taken after the reference-app review (2026-10-27)

Recorded because each one departs from the original spec/plan. Migration: `20261027000015_public_player_booking.sql`.

| ID | Decision | Departs from | Notes |
|---|---|---|---|
| DEC-P01 | Public home, hall, device and availability pages without sign-in; sign-in only to book | Spec: web is staff-only, customers use mobile | `anon` may execute five read-only RPCs and nothing else (asserted in `hall_management.test.ts`) |
| DEC-P02 | Email + password sign-in and sign-up besides Google | Spec §5.2 (Google only) | Needs Supabase email provider and email confirmation ON; hall invitations are bound to the confirmed email |
| DEC-P03 | A player's booking is `pending` and holds the slot until staff confirm or reject (`reservation.confirm`); unanswered requests expire at start time | Plan: confirmed immediately | Staff-created reservations stay confirmed; walk-ins still only look at confirmed reservations, so `confirm_reservation` re-validates |
| DEC-P04 | Devices priced by player count (PlayStation, billiards): rules with `players_count` 2 or 4 on a device or category | DEC-05/10 (hourly rate only) | A device with such rules requires the player to pick a count; all other devices are flat. No time-of-day windows |
| DEC-P05 | Read-only price estimate shown to anonymous visitors (`quote_public_price`) | Plan: prices visible to staff only | The real charge still comes from the session snapshot |
| DEC-P06 | "My bookings" for players with cancellation until `cancellation_deadline_minutes` | Plan: cancellation by staff only | Player limits (provisional): 4 h per booking, 5 upcoming active bookings |
| DEC-P07 | Arabic (RTL, default) and English on public pages and login, chosen by cookie; staff dashboard stays English | Spec: English only | Messages in `src/lib/i18n/messages.ts` |

Not adopted from the reference on purpose: custom OTP-by-SMTP login, storing an encrypted password in a table, and API routes using the service-role key (the plan keeps the service role out of the web app).

| ID | Decision (products, 2026-10-28) | Departs from | Notes |
|---|---|---|---|
| DEC-P08 | Products: a per-hall catalog and items sold during a session, added to that session's invoice | Not in the original plan (reference feature) | Migration 16. Money in minor units; no stock tracking yet |
| DEC-P09 | The database takes name and price from the catalog when an item is added and snapshots them; the browser never sends a price | Reference app (client sent name and price) | Later catalog edits never change existing lines |
| DEC-P10 | `product.manage` (catalog) is owner-only; `product.sell` (add/remove items) is owner + employee | Reference app (staff managed products) | Plan §4.2: employees keep to day-to-day operations. Adjust in a new migration if the business decides otherwise |
| DEC-P12 | Time windows bill per segment: each billed minute uses the rate of the window it falls in, else the base rate. Windows come from the most specific scope that has any (device, then category, then hall) and are copied into the session snapshot at start | Plan PRC-002 | Spec 10.2: invoices never recalculate from current rules; running sessions keep their windows. Overnight ranges are entered as two windows |
| DEC-P13 | A package is a fixed price for a fixed duration. Time beyond it is billed at the regular hourly rate (with the session's own windows); more package time means starting another package session. Package validity dates are UTC | Plan PRC-003, owner decision | Auditable usage history (`package_uses`); price and duration are snapshotted on the use |
| DEC-P14 | Discounts are append-only records on an invoice (before, discount, after, reason, who). The owner has no limit; an employee needs a configured limit and may not exceed it per discount. Percent discounts apply to the invoice's gross, never compounded. Only unpaid or partly paid invoices can be discounted, and never beyond what is still owed | Plan PRC-004/005, spec 14.1, owner decision | The client never sends an amount; paid invoices are corrected with refunds |
| DEC-P15 | Freezing a wallet is an owner action with a written reason; a frozen wallet cannot be topped up, spent or withdrawn from | Plan WAL-005 | Uses the existing owner-only `wallet.withdraw` permission; audited |
| DEC-P16 | A withdrawal is cash paid back from the open shift, in one owner step with a reason (ledger entry + drawer payout + audit). No separate approver, because only owners hold the permission | Plan WAL-004, DEC-07 still open | If employees may ever request withdrawals, add a request/approve step like refunds |
| DEC-P17 | A write-off removes part or all of what is still owed on an unpaid invoice, with a reason, and never touches money already paid. A fully written-off invoice shows total 0 and status paid | Plan FIN-008 | Append-only record; the `/adjustments` page lists write-offs, discounts and voids together |
| DEC-P18 | Expenses are owner-only records. They never change the cash drawer or a shift count (a drawer payout stays a shift payout). They are corrected with an audit trail or voided with a reason, never deleted. There is no approval step, because only owners can create them | Plan ACC-006 | The `receipts` bucket is private; the upload and the signed link both go through the signed-in owner, with Storage policies that check the hall folder |
| DEC-P19 | Advanced reports return every figure from the database; expenses, discounts and write-offs are shown as separate totals, never netted against revenue | Plan ACC-008, spec 13.3 | Charts are plain bars with the numbers written beside them |
| DEC-P20 | Receipts accept JPG, PNG, WebP and PDF up to 5 MB, checked in the web action and again by the bucket | Plan ACC-006 | Path must be `<hall>/<expense>/<file>`, enforced by the database when linking |
| DEC-P21 | Profiles get a unique, lowercase `username` (3 to 20 letters, digits or underscore). The sign-up form requires it for email accounts and checks availability first; the database enforces format and uniqueness. It is optional for Google sign-ins and older accounts, and it is for display only, not for signing in | Owner request | `username_available` is callable before sign-in and only answers true/false for one name |
| DEC-P22 | Everyone must have a username. A signed-in account without one (Google sign-ins, older accounts) is sent to `/choose-username` before using the app. They choose it once; it must be unique and must not be just their Google name or the first part of their email; it cannot be changed afterwards | Owner request | `set_my_username` enforces this in the database; the web gate is `needsUsername` in the sign-in redirect and `requireUser` |
| DEC-P11 | Items can change only while the session is running; the invoice is created at session end with one line per item; corrections are refunds or voids | Reference app (items editable) | Append-only financial history; add/remove take the same row lock as end_session |

### DEC-P23 to DEC-P26: sales team, one hall per account, deletion, no tenants

- **DEC-P23 (sales team):** the super admin creates sales accounts (email + password) and sees who sold each hall and who is responsible for each sales account (`profiles.responsible_id`). The password is hashed in the database and never logged.
- **DEC-P24 (one hall per account):** a super admin creates a hall together with its owner's email and password (`admin_create_hall_with_owner`). Every hall is in `Asia/Damascus`; the currency is SYP or USD. The time zone can no longer be changed from hall settings.
- **DEC-P25 (deletion):** the super admin can permanently delete a hall (all its data and the accounts that only belonged to it) or an account. Typed confirmation plus a reason; one audit entry that is not tied to the deleted hall remains. Append-only triggers are switched off only inside that transaction. An account still named on required hall records cannot be deleted (deactivate instead); an owner's hall must be deleted first.
- **DEC-P26 (no tenants):** the tenant (business) concept is removed from the database and the UI. A hall is the customer. `sales_attributions.hall_id` and `sales_leads.converted_hall_id` replace `tenant_id`; whether a hall is usable depends on its own status only. Deleting a hall removes its sales credit but keeps the lead record.
