# Web Task Backlog

Each task is sized for one reviewable PR (0.5–3 engineer-days). Est = engineer-days. Pri: P0 MVP, P1 pilot, P2 later. "BE" = backend prerequisite from `WEB_API_AND_DATA_CONTRACTS.md` §9. Common definition of done for every task: type-check/lint/tests green, loading/empty/error states, authz rows added to the matrix (TEST-002), no financial arithmetic, docs updated.

Paths are relative to `web/`.

## WEB — project setup & standards (Phase W1)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| WEB-001 | Initialize Next.js app | P0 | DEC-W01 ack | 0.5 | `package.json`, `next.config.ts`, `src/app/` | `create-next-app` (TS, App Router, Tailwind, src dir, ESLint); pin Node LTS in `.nvmrc`; pnpm | `pnpm dev` serves placeholder | build passes | NFR |
| WEB-002 | Strict TS, ESLint, Prettier, Husky | P0 | WEB-001 | 0.5 | `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`, `.husky/` | `strict`, `noUncheckedIndexedAccess`; typescript-eslint strict, jsx-a11y; lint-staged | pre-commit blocks lint errors | CI lint | NFR |
| WEB-003 | Vitest + RTL + MSW setup | P0 | WEB-001 | 0.5 | `vitest.config.ts`, `tests/msw/` | jsdom env, setup file, MSW server | sample test passes | — | — |
| WEB-004 | Playwright + axe setup | P0 | WEB-001 | 0.5 | `playwright.config.ts`, `tests/e2e/` | projects for 3 viewports; axe helper | sample e2e passes | — | NFR-01/02 |
| WEB-005 | CI pipeline | P0 | WEB-002..004 | 1 | `.github/workflows/web-ci.yml` | jobs: install, typecheck, lint, unit, build, e2e-smoke; cache | PR shows required checks | — | NFR |
| WEB-006 | Env validation | P0 | WEB-001 | 0.5 | `src/lib/env.ts`, `.env.example` | Zod schema for public/server vars; fail fast | missing var fails build | U | SEC-01 |
| WEB-007 | Local Supabase wiring & type generation | P0 | BE-PREREQ-01 | 1 | `src/contracts/database.ts`, `package.json` scripts | `supabase start` docs, `gen:types` script, CI drift check | types generated from schema | CI drift | TEN-05 |
| WEB-008 | Logger + Sentry | P0 | WEB-006 | 1 | `src/lib/logger.ts`, `sentry.*.config.ts` | structured logger, scrubbing `beforeSend` | test error appears scrubbed | U (scrubber) | NFR-05, SEC-05 |
| WEB-009 | i18n scaffold | P1 | WEB-001 | 0.5 | `src/i18n/`, `messages/en.json` | next-intl, message keys convention | strings resolvable | U | DEC-W02 |

## UI — design system & shell (Phase W2)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| UI-001 | Design tokens & theme | P0 | WEB-001 | 1 | `src/app/globals.css`, `tailwind` config | color/spacing/typography tokens, light/dark, status colors with AA contrast | contrast check passes | A | NFR-02 |
| UI-002 | shadcn primitives | P0 | UI-001 | 1 | `src/components/ui/*` | button, input, select, dialog, sheet, tabs, table, badge, toast, tooltip, dropdown, skeleton, form | storybook-free demo page in dev | C | — |
| UI-003 | App shell: sidebar, topbar, breadcrumbs, skip link | P0 | UI-002 | 2 | `src/components/shell/*`, `(app)/layout.tsx` | nav config typed with required permission per item; drawer < 1024 px | keyboard nav; collapses responsive | C, A, E | TEN-03, NFR-01 |
| UI-004 | DataTable with server pagination/filter/sort via URL | P0 | UI-002 | 2 | `src/components/data/*`, `src/lib/query/searchParams.ts` | TanStack Table wrapper, FilterBar, Pagination, column visibility | URL reflects state; back button works | C | NFR-03 |
| UI-005 | Empty/Error/Loading/Forbidden components | P0 | UI-002 | 1 | `src/components/data/EmptyState.tsx`, `ErrorState.tsx`, `src/components/domain/Forbidden.tsx` | reference id display | used by template route | C | NFR-03 |
| UI-006 | Money, HallTime, StatusBadge | P0 | UI-002 | 1 | `src/components/domain/*`, `src/lib/money.ts`, `src/lib/dates.ts` | `formatMoney(minor,currency,locale)`, `parseMoneyInput`, TZ formatting, badge maps for all enums | DST & currency precision tests | U | HALL-06, PRC-06 |
| UI-007 | ConfirmDialog & ReasonDialog | P0 | UI-002 | 0.5 | `src/components/domain/*` | typed confirmation variant for destructive ops | focus trap, returns focus | C, A | — |
| UI-008 | Form field components (RHF+Zod) | P0 | UI-002 | 1 | `src/components/form/*` | FieldError with aria-describedby, server fieldErrors mapping | invalid fields announced | C | — |
| UI-009 | Toast + action-result feedback | P0 | UI-002, API-001 | 0.5 | `src/components/domain/useActionToast.ts` | map ErrorCode → message | — | C | SEC-02 |
| UI-010 | Hall switcher | P0 | AUTH-006 | 0.5 | `src/components/shell/HallSwitcher.tsx` | lists memberships; preserves sub-route if permitted | only member halls | C, Z | TEN-01 |

## AUTH — authentication & authorization (Phases W3–W4)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| AUTH-001 | Supabase server/browser clients | P0 | WEB-006 | 0.5 | `src/lib/supabase/{server,client}.ts` | `@supabase/ssr` cookie adapters; `server-only` | no service key used | U | SEC-01 |
| AUTH-002 | Middleware session refresh & redirect | P0 | AUTH-001 | 1 | `middleware.ts`, `src/lib/supabase/middleware.ts` | refresh cookie; protect `(app)`; matcher excludes static | expired → `/login?next=` | U, E | AUTH-04 |
| AUTH-003 | Login page | P0 | AUTH-001, UI-002 | 0.5 | `(public)/login/page.tsx` | Google button, error banner, sanitized `next` | — | C, E | AUTH-01 |
| AUTH-004 | OAuth callback + landing resolver | P0 | AUTH-003, AUTH-006 | 1 | `auth/callback/route.ts`, `src/lib/auth/landing.ts` | exchange code; `resolveLanding(context)` | role landings correct | U, I | AUTH-01 |
| AUTH-005 | Sign-out (POST) | P0 | AUTH-001 | 0.5 | `auth/signout/route.ts` | POST only; clear cookies | — | E | AUTH-04 |
| AUTH-006 | `requireUser` + `get_my_context` loader | P0 | BE-PREREQ-03 | 1 | `src/lib/auth/session.ts`, `(app)/layout.tsx` | React.cache per request; typed context | context available to layouts | I | AUTH-03 |
| AUTH-007 | No-access & deactivated handling | P0 | AUTH-006 | 0.5 | `(gate)/no-access/page.tsx` | inactive → sign out + page | customer-only lands here | E, Z | AUTH-02, AUTH-05 |
| AUTH-008 | Select hall + last-hall restore | P0 | AUTH-006, UI-010 | 0.5 | `(gate)/select-hall/page.tsx` | cookie `last_hall_id` revalidated | — | E | AUTH-08, TEN-01 |
| AUTH-009 | Hall guards & `PermissionGate` | P0 | AUTH-006, API-003, BE-PREREQ-04 | 2 | `src/lib/auth/guards.ts`, `halls/[hallId]/layout.tsx`, `src/components/domain/PermissionGate.tsx` | `requireHallMembership` (404), `requireHallPermission` (403), `requirePlatformRole`; action helper `withPermission` | forged hallId → 404 | U, Z | AUTH-06, TEN-02/04 |
| AUTH-010 | Error/not-found/forbidden boundaries | P0 | UI-005 | 0.5 | `src/app/error.tsx`, `not-found.tsx` | reference id from Sentry | no internal details shown | C | SEC-02 |
| AUTH-011 | Account page | P1 | AUTH-006 | 0.5 | `(app)/account/page.tsx` | profile update action | — | I | AUTH-09 |

## API — data access foundations (Phase W4)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| API-001 | ActionResult & error mapping | P0 | WEB-001 | 1 | `src/lib/actions/{result,errors}.ts` | map SQLSTATE/P0001 codes → ErrorCode; safe messages | unknown errors → UNKNOWN w/o details | U | SEC-02 |
| API-002 | Idempotency helper | P0 | API-001 | 0.5 | `src/lib/actions/idempotency.ts`, `useIdempotencyKey` hook | key per dialog intent; reset on success | retries reuse key | U | SEC-03 |
| API-003 | Contracts: permissions, enums | P0 | WEB-007, DEC-01 | 0.5 | `src/contracts/{permissions,enums}.ts` | union types; exhaustive badge maps | type errors on unknown enum | U | TEN-05, PRC-06 |
| API-004 | Realtime invalidation hook | P0 | AUTH-001, BE-PREREQ-10 | 1.5 | `src/lib/realtime/useHallChannel.ts`, QueryProvider | subscribe per hall; invalidate keys; refetch on reconnect; stale banner | missed events recovered | C, E | RT-01 |
| API-005 | Query helpers (pagination, filters, keyset) | P0 | UI-004 | 0.5 | `src/lib/query/*` | typed parse of search params | — | U | — |
| API-006 | MSW handlers for contracts | P0 | API-001 | 2 (rolling) | `tests/msw/handlers/*` | handlers per RPC used by each feature | features testable without backend | — | R-01 |

## HALL — overview & settings (Phase W5)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| HALL-001 | Hall overview page | P0 | AUTH-009, BE-PREREQ-05/06 | 2 | `halls/[hallId]/page.tsx`, `features/halls/*` | KPI cards; financial KPIs gated & not fetched without perm | B1 acceptance | C, E, Z | HALL-01 |
| HALL-002 | Settings: profile tab | P0 | AUTH-009, BE-PREREQ-05 | 1 | `halls/[hallId]/settings/*` | form + `update_hall_settings` | audit event | U, I, Z | HALL-02 |
| HALL-003 | Settings: working hours | P0 | HALL-002 | 1.5 | same | weekly editor, overlap validation | B2 acceptance | U, I | HALL-03 |
| HALL-004 | Settings: policies | P0 | HALL-002, DEC-02/03 | 1 | same | numeric fields with "proposed default" labels | — | U, I | HALL-04 |
| HALL-005 | Settings: currency & payment methods | P0 | HALL-002 | 0.5 | same | method toggles from allowed list | — | I | HALL-05 |

## DEV / AGT — devices & agents (Phase W6)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| DEV-001 | Device grid/table | P0 | UI-004, BE-PREREQ-06 | 2 | `halls/[hallId]/devices/page.tsx`, `features/devices/*` | DeviceCard with 5 state dimensions, filters | C1 acceptance | C, E | DEV-01 |
| DEV-002 | Device create/edit/disable | P0 | DEV-001 | 1.5 | `devices/new`, `devices/[id]/edit` | `upsert_device`; uniqueness error | — | U, I, Z | DEV-02 |
| DEV-003 | Device detail | P0 | DEV-001 | 1.5 | `devices/[deviceId]/page.tsx` | sections C3 | — | C | DEV-03 |
| DEV-004 | Maintenance start/end with impact preview | P0 | DEV-003 | 1.5 | `features/devices/MaintenanceDialog.tsx` | preview RPC then start | warning list shown | I, E | DEV-04 |
| DEV-005 | Realtime device grid | P0 | DEV-001, API-004 | 1 | `features/devices/*` | wire channel; stale banner | E2E-13 | E | DEV-01, RT-01 |
| AGT-001 | Agent health page | P0 | BE-PREREQ-09 | 1 | `halls/[hallId]/agents/page.tsx` | table + offline filter | — | C | AGT-01 |
| AGT-002 | Command request dialog | P0 | DEV-003, API-002 | 1.5 | `features/agents/CommandDialog.tsx` | capability-filtered types; typed confirm for SHUTDOWN/RESTART | Z: no `device.control` denied | I, Z, E | AGT-02 |
| AGT-003 | Command history page | P0 | AGT-001 | 1 | `halls/[hallId]/commands/page.tsx` | filters, pagination | — | C, I | AGT-03 |
| AGT-004 | Command status timeline (live) | P0 | AGT-003, API-004 | 1 | `features/agents/CommandTimeline.tsx` | "Outcome unknown" for timeout; no retry for non-idempotent | E2E-09 | C, E | AGT-03/04 |

## RES / SES — reservations & sessions (Phase W7)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| RES-001 | Reservation queue/list | P0 | UI-004, BE-PREREQ-07 | 1.5 | `halls/[hallId]/reservations/*`, `features/reservations/*` | today's arrivals, statuses incl. no-show reason | — | C | RES-01, RES-07 |
| RES-002 | Calendar device×time grid | P0 | RES-001 | 3 | `features/reservations/Calendar/*` | CSS grid, day/week, hours shading, maintenance, blocks; keyboard accessible | renders 100 devices smoothly | C, A, E | RES-01 |
| RES-003 | Staff create reservation | P1 | RES-002, DEC-W05 | 1.5 | `features/reservations/CreateReservationDialog.tsx` | availability fetch; conflict error | — | I, E | RES-02 |
| RES-004 | Reservation detail + events | P0 | RES-001 | 1 | `reservations/[reservationId]/page.tsx` | timeline | — | C | RES-03 |
| RES-005 | Check-in dialog | P0 | RES-004, API-002 | 1.5 | `features/reservations/CheckInDialog.tsx` | idempotent RPC; navigate to session | E2E-02, E2E-05 | I, E | RES-04 |
| RES-006 | Late check-in override | P0 | RES-005, DEC-03 | 0.5 | same | permission-gated toggle + reason | Z denial | I, Z | RES-05 |
| RES-007 | Cancel reservation | P0 | RES-004, DEC-02 | 1 | `features/reservations/CancelDialog.tsx` | reason; backend preview of effect | history preserved | I, E | RES-06 |
| RES-008 | Waiting list view | P2 | DEC-04 | 1 | `halls/[hallId]/waiting-list/page.tsx` | read-only queue | — | C | RES-08 |
| SES-001 | Active sessions board + timers | P0 | BE-PREREQ-07, API-004 | 2 | `halls/[hallId]/sessions/page.tsx`, `features/sessions/*` | server-offset timer hook | timers match server | U, C, E | SES-01 |
| SES-002 | Walk-in dialog with quote | P0 | SES-001, API-002 | 2 | `features/sessions/WalkInDialog.tsx` | availability, quote, idempotent start | E2E-03 | U, I, E | SES-02 |
| SES-003 | End session dialog | P0 | SES-001 | 1 | `features/sessions/EndSessionDialog.tsx` | end types; show invoice Open | never "Paid" | I, E | SES-03 |
| SES-004 | Extend session dialog | P0 | SES-001 | 1 | `features/sessions/ExtendDialog.tsx` | preview conflict; reason | conflict shows reservation | I, E | SES-04 |
| SES-005 | Convert to open | P1 | SES-001 | 0.5 | `features/sessions/*` | reason; rejection message | — | I | SES-05 |
| SES-006 | Session history | P0 | UI-004 | 1 | `sessions/history/page.tsx` | filters | — | C | SES-06 |
| SES-007 | Session detail (snapshot, events, commands) | P0 | SES-006 | 1 | `sessions/[sessionId]/page.tsx` | separate session vs command state | — | C | SES-07 |

## PRC — pricing (Phase W8a)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| PRC-001 | Rates editor | P0 | BE-PREREQ-11, DEC-05 | 2 | `halls/[hallId]/pricing/*`, `features/pricing/*` | standard/category/device; parse input to minor units | applies to new sessions copy | U, I, Z | PRC-01 |
| PRC-002 | Pricing windows | P1 | PRC-001 | 1.5 | same | day/time ranges | backend overlap error shown | I | PRC-02 |
| PRC-003 | Packages CRUD + usage history | P1 | BE-PREREQ-11, DEC-W10 | 2 | `halls/[hallId]/packages/*` | — | — | I | PRC-03 |
| PRC-004 | Discounts CRUD | P1 | BE-PREREQ-11 | 1.5 | `halls/[hallId]/discounts/*` | — | — | I | PRC-04 |
| PRC-005 | Apply discount dialog | P1 | PRC-004, FIN-002 | 1 | `features/pricing/ApplyDiscountDialog.tsx` | limit error mapping | server amounts shown | I, Z | PRC-05 |

## FIN — invoices, payments, refunds (Phase W8b)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| FIN-001 | Invoice list | P0 | BE-PREREQ-11 | 1.5 | `halls/[hallId]/invoices/page.tsx`, `features/invoices/*` | status quick filters; backend totals | — | C, Z | INV-01 |
| FIN-002 | Invoice detail | P0 | FIN-001 | 1.5 | `invoices/[invoiceId]/page.tsx` | items, payments, refunds, history | — | C | INV-02 |
| FIN-003 | Collect cash payment | P0 | FIN-002, ACC-001, API-002 | 2 | `features/payments/CollectPaymentDialog.tsx` | shift check, partial per config | E2E-03, E2E-05 | I, E | INV-03 |
| FIN-004 | Pay from wallet | P0 | FIN-003, WAL-001 | 1 | same | wallet selection; INSUFFICIENT_FUNDS | E2E-04 | I, E | INV-04 |
| FIN-005 | Payment detail | P0 | FIN-002 | 1 | `payments/[paymentId]/page.tsx` | attempts | — | C | INV-05 |
| FIN-006 | Refund request | P0 | FIN-005, DEC-08 | 1 | `features/refunds/RequestRefundDialog.tsx` | reason codes | — | I, Z | INV-06 |
| FIN-007 | Refunds approval page | P0 | FIN-006 | 1.5 | `halls/[hallId]/refunds/page.tsx` | approve/reject | E2E-06 | I, Z, E | INV-07 |
| FIN-008 | Adjustments/reversals + void/write-off | P0 | FIN-002 | 2 | `halls/[hallId]/adjustments/*` | create with reason; no edit/delete | — | I, Z | INV-08, INV-10 |
| FIN-009 | Outstanding invoices view | P0 | FIN-001 | 0.5 | `features/invoices/*` | preset filter + overview link | — | C | INV-01 |

## WAL — wallets (Phase W8c)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| WAL-001 | Wallet list | P0 | BE-PREREQ-12 | 1 | `halls/[hallId]/wallets/page.tsx`, `features/wallets/*` | search | sales denied | C, Z | WAL-01 |
| WAL-002 | Wallet detail & ledger | P0 | WAL-001 | 1.5 | `wallets/[walletId]/page.tsx` | reversal links | — | C | WAL-02 |
| WAL-003 | Cash top-up | P0 | WAL-002, ACC-001, DEC-06 | 1 | `features/wallets/TopUpDialog.tsx` | liability copy; idempotent | E2E-05 | I, E | WAL-03 |
| WAL-004 | Withdrawal request/decision | P1 | WAL-002, DEC-07 | 1.5 | `features/wallets/WithdrawalDialog.tsx` | approval flow | — | I, Z | WAL-04 |
| WAL-005 | Freeze/unfreeze | P1 | WAL-002 | 0.5 | `features/wallets/*` | reason | — | I | WAL-05 |

## ACC — shifts, registers, expenses, reports (Phase W9)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| ACC-001 | Shifts list & open shift | P0 | BE-PREREQ-13 | 1.5 | `halls/[hallId]/shifts/page.tsx`, `features/shifts/*` | opening cash input | — | I, E | ACC-01 |
| ACC-002 | Shift detail summary | P0 | ACC-001 | 1 | `shifts/[shiftId]/page.tsx` | backend expected cash | — | C | ACC-02 |
| ACC-003 | Unpaid-invoice gate step | P0 | ACC-002 | 1 | `features/shifts/CloseShift/UnpaidGate.tsx` | table + collect links | E2E-07 | C, E | ACC-03 |
| ACC-004 | Close shift stepper + override | P0 | ACC-003, DEC-11 | 1.5 | `features/shifts/CloseShift/*` | count, discrepancy, override reason | E2E-07 | I, Z, E | ACC-04 |
| ACC-005 | Registers & cash movements | P1 | ACC-002, DEC-W08 | 1.5 | `halls/[hallId]/registers/*` | payouts/adjustments with reason | — | I | ACC-05 |
| ACC-006 | Expenses with receipt upload | P2 | DEC-15, BE-PREREQ-17 | 2 | `halls/[hallId]/expenses/*` | signed upload URLs; approval | — | I | ACC-06 |
| ACC-007 | Basic financial/operational report | P0 | BE-PREREQ-13 | 2 | `halls/[hallId]/reports/page.tsx`, `features/reports/*` | period picker (hall TZ), category cards with definitions | top-ups ≠ revenue | C, I, Z | ACC-07 |
| ACC-008 | Advanced reports & charts | P2 | ACC-007 | 3 | `features/reports/*` | breakdowns, Recharts lazy | — | C | ACC-08 |
| ACC-009 | CSV export | P1 | ACC-007 | 0.5 | `features/reports/export.ts` | server-generated CSV route | audited | I | ACC-09 |

## EMP — employees (Phase W9)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| EMP-001 | Employees list | P0 | BE-PREREQ-04 | 1 | `halls/[hallId]/employees/page.tsx`, `features/employees/*` | members + pending invitations | — | C, Z | EMP-01 |
| EMP-002 | Invite employee + accept flow | P0 | EMP-001, BE-PREREQ-08 | 2 | `features/employees/InviteDialog.tsx`, `(gate)/invite/[token]/page.tsx` | invite; accept after Google sign-in | E2E-10 | I, E | EMP-02 |
| EMP-003 | Edit role/permissions/discount limit | P0 | EMP-001, DEC-01 | 1.5 | `employees/[membershipId]/page.tsx` | grouped checklist | audited | I, Z | EMP-03 |
| EMP-004 | Deactivate/reactivate | P0 | EMP-003 | 0.5 | same | reason | E2E-11 | Z, E | EMP-04 |
| EMP-005 | My activity | P1 | AUD-001 | 0.5 | `halls/[hallId]/my-activity/page.tsx` | self-filtered | only own | Z | EMP-05 |

## RISK / NTF / AUD (Phase W10a)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| AUD-001 | Hall audit log | P0 | BE-PREREQ-14 | 1.5 | `halls/[hallId]/audit/page.tsx`, `features/audit/*` | filters; safe diff viewer | — | C, Z | AUD-01 |
| AUD-002 | Platform audit log | P0 | AUD-001 | 0.5 | `admin/audit/page.tsx` | reuse components | SA only | Z | AUD-02 |
| NTF-002 | Live event toasts | P1 | API-004 | 1 | `src/components/shell/LiveToasts.tsx` | command results, payment completion | — | C | NTF-02 |
| NTF-001 | Notifications page & bell | P2 | BE notifications | 1.5 | `(app)/notifications/page.tsx` | list, mark read | — | C | NTF-01 |
| RISK-001 | Risk monitor page | P2 | BE risks RPC | 2 | `halls/[hallId]/risks/page.tsx` | table, severity, action links | no auto changes | C | RISK-01 |

## ADM — platform administration (Phase W10b)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| ADM-001 | Admin layout & overview | P0 | AUTH-009 | 1 | `(app)/admin/layout.tsx`, `admin/page.tsx` | `requirePlatformRole`; counts | non-SA 404 | Z | ADM-05 |
| ADM-002 | Tenants list & create | P0 | ADM-001, DEC-17 | 1.5 | `admin/tenants/*`, `features/admin/*` | — | — | I, Z | ADM-01 |
| ADM-003 | Tenant detail: halls, owner invitation | P0 | ADM-002 | 2 | `admin/tenants/[tenantId]/page.tsx` | create hall; invite owner | E2E-12 | I, E | ADM-01 |
| ADM-004 | Tenant activation/deactivation | P0 | ADM-003 | 0.5 | same | reason | owner loses access | Z, E | ADM-02 |
| ADM-005 | Users & platform roles | P0 | ADM-001 | 1.5 | `admin/users/*` | assign/revoke | audited | I, Z | ADM-03 |
| ADM-006 | Cross-hall search | P2 | ADM-001 | 1.5 | `admin/search/page.tsx` | reason required | audited | Z | ADM-06 |
| ADM-007 | Monitoring page | P2 | ADM-001 | 1.5 | `admin/monitoring/page.tsx` | agent/commands/payment discrepancies | — | C | ADM-05 |
| ADM-008 | Platform settings | P2 | ADM-001 | 1 | `admin/settings/page.tsx` | — | audited | I | ADM-07 |

## SALES (Phase W10c)

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| SALES-001 | Sales layout & home | P1 | AUTH-009, BE-PREREQ-16 | 1 | `(app)/sales/layout.tsx`, `sales/page.tsx` | sales nav only | finance routes absent | Z | SALES-05 |
| SALES-002 | Leads list | P1 | SALES-001 | 1 | `sales/leads/page.tsx` | own vs all per role | — | C, Z | SALES-01 |
| SALES-003 | Lead detail & onboarding submission | P1 | SALES-002, DEC-16 | 2 | `sales/leads/[leadId]/page.tsx` | submit/draft | — | I | SALES-01 |
| SALES-004 | Assign leads | P1 | SALES-002 | 0.5 | `features/sales/*` | SAD only | — | Z | SALES-02 |
| SALES-005 | Attribution & disputes | P1 | SALES-001 | 1.5 | `sales/attribution/page.tsx` | resolve with reason | audited | I, Z | SALES-03 |
| SALES-006 | Manage sales agents | P1 | SALES-001 | 1 | `sales/agents/page.tsx` | invite/deactivate | — | I | SALES-02 |
| SALES-007 | Sales reports | P2 | SALES-002 | 1.5 | `sales/reports/page.tsx` | conversion; no financial data | — | C, Z | SALES-04 |

## SEC — web security

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| SEC-001 | Security headers & CSP | P0 | WEB-001 | 1 | `next.config.ts`, `middleware.ts` | CSP with nonces, HSTS, frame-ancestors none, Referrer-Policy, Permissions-Policy | header test | U, E | SEC-04 |
| SEC-002 | Open-redirect & `next` param protection | P0 | AUTH-003 | 0.5 | `src/lib/auth/redirect.ts` | allow relative paths only | malicious URLs rejected | U | SEC-04 |
| SEC-003 | Service-role/secret guard | P0 | WEB-005 | 0.5 | ESLint rule, CI step | grep src & `.next` client bundle for service key/env names | CI fails on reference | CI | SEC-01 |
| SEC-004 | Cross-tenant test suite | P0 | AUTH-009, BE-PREREQ-15 | 2 (+rolling) | `tests/integration/authz/*`, `tests/e2e/authz/*` | data-driven matrix | all §24.4 cases | Z | TEN-04/07, SALES-05 |
| SEC-005 | Server Action hardening | P0 | API-001 | 0.5 | `src/lib/actions/*` | verify Origin, input size limits, Zod on server | — | U | SEC-04 |
| SEC-006 | PII/token scrubbing | P0 | WEB-008 | 0.5 | logger, Sentry config | redact keys list | — | U | SEC-05 |
| SEC-007 | Pre-pilot security review | P0 | W9 done | 2 | `docs/planning/` checklist | checklist §8 of plan; dependency audit | sign-off | — | all SEC |

## TEST — cross-cutting quality

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| TEST-001 | Role seed fixtures & auth helpers | P0 | BE-PREREQ-15 | 1.5 | `tests/fixtures/*` | per-role sessions for integration & E2E | — | — | — |
| TEST-002 | Authorization matrix framework | P0 | TEST-001, AUTH-009 | 2 | `tests/integration/authz/matrix.ts` | role×route×action table; generated tests | runs in CI | Z | TEN-04/06, ADM-04, SALES-05 |
| TEST-003 | Financial E2E suite (E2E-03..07) | P0 | W8, W9 | 3 | `tests/e2e/finance/*` | incl. double-submit & audit asserts | green | E | INV, WAL, ACC, AUD-03 |
| TEST-004 | Accessibility crawl | P0 | WEB-004 | 1 | `tests/e2e/a11y.spec.ts` | visit all routes per role | 0 serious | A | NFR-02 |
| TEST-005 | Performance budgets | P1 | DEPLOY-001 | 1 | `lighthouserc.json`, CI | — | budgets enforced | — | NFR-06 |
| TEST-006 | Reservation/session E2E (E2E-02, 08, 09, 13) | P0 | W7 | 2 | `tests/e2e/operations/*` | agent stub | green | E | RES, SES, AGT |
| TEST-007 | Responsive checks | P0 | UI-003 | 1 | `tests/e2e/responsive/*` | 3 viewports screenshots | no overflow | E | NFR-01 |

## DEPLOY

| ID | Title | Pri | Deps | Est | Files | Steps | Acceptance | Tests | REQ |
|---|---|---|---|---|---|---|---|---|---|
| DEPLOY-001 | Vercel project & environments | P0 | WEB-005 | 0.5 | Vercel config, `docs/` | preview→staging Supabase, prod→prod; env vars per env | previews build | — | NFR-04 |
| DEPLOY-002 | OAuth redirect configuration per env | P0 | BE-PREREQ-02 | 0.5 | runbook | Supabase + Google console allowlists | sign-in works in each env | manual | AUTH-01 |
| DEPLOY-003 | Sentry releases & source maps | P0 | WEB-008 | 0.5 | CI | upload maps privately | — | — | NFR-05 |
| DEPLOY-004 | Runbook: deploy, rollback, incident | P0 | DEPLOY-001 | 1 | `web/docs/operations/RUNBOOK.md` | — | reviewed | — | §23 |
| DEPLOY-005 | Pilot release (one hall) | P0 | W11 | 1 | — | staging sign-off, feature flags off for P2 | pilot acceptance | E | §25 Ph11 |
| DEPLOY-006 | Production release | P0 | DEPLOY-005 | 1 | — | release checklist | §28 DoD | — | §28 |
