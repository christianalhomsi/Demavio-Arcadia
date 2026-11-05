# Web Testing Strategy

Aligned with spec §24 and the Definition of Done (§24.4, §28): a feature is done only when the workflow works, **unauthorized actions fail**, data integrity holds, errors are handled, audit events exist, retries are safe, and critical behavior has automated coverage. Backend-internal tests (RLS policies, concurrency in SQL, jobs) belong to the backend suite; the web suite verifies the web's integration with them.

## 1. Layers

| Layer | Tool | Scope | Location | Runs |
|---|---|---|---|---|
| Static | `tsc --noEmit`, ESLint (incl. jsx-a11y, no-restricted-imports for `server-only` and service keys), Prettier check | all code | — | pre-commit, CI |
| Unit | Vitest | `lib/*` (money formatting/parsing, dates/TZ, error mapping, idempotency helper, landing resolver, permission helpers), Zod schemas | `src/**/__tests__` | CI |
| Component | Vitest + RTL + MSW | page sections, dialogs, `PermissionGate`, `DataTable`, state rendering (loading/empty/error/success) | `src/**/__tests__` | CI |
| Integration | Vitest (node) + local Supabase (CLI) with seed | `features/*/queries.ts` + `actions.ts` against real RLS/RPCs; contract tests for each RPC shape | `tests/integration` | CI (service container) once BE-PREREQ-01/15 exist |
| Authorization / cross-tenant | Vitest integration + Playwright | role × route × action matrix; hall A user vs hall B ids | `tests/integration/authz`, `tests/e2e/authz` | CI, required |
| E2E | Playwright (Chromium required; Firefox/WebKit nightly) | critical workflows, below | `tests/e2e` | CI on PR (smoke), full nightly + pre-release |
| Accessibility | `@axe-core/playwright` | every route in E2E crawl | `tests/e2e/a11y` | CI |
| Responsive | Playwright projects at 360×800, 768×1024, 1280×800 | shell, grid, calendar, dialogs | `tests/e2e/responsive` | CI |
| Performance | Lighthouse CI on staging preview; bundle analyzer budget | overview, devices, reservations, invoices | — | PR to main |

## 2. Test data

Seed (BE-PREREQ-15): Tenant T1 (halls H1, H2), Tenant T2 (hall H3). Users: `owner_h1`, `owner_h1h2`, `employee_h1` (default perms), `employee_h1_cashier` (+payment.collect, shift.*), `employee_h1_noperms`, `owner_h3`, `super_admin`, `sales_agent`, `sales_admin`, `customer_only`, `deactivated_user`. Financial fixtures: open/partially paid/paid invoices, wallet with balance, frozen wallet, open shift with unpaid invoices.
E2E authentication: test-only session minting against local Supabase (never enabled in staging/prod; guarded by `APP_ENV=test`). One E2E smoke on staging uses a real Google test account manually (release checklist).

## 3. Authorization & cross-tenant matrix (TEST-002, SEC-004)

For each role × each hall route and each Server Action:
- Expected: allowed / 403 Forbidden / 404 Not found.
- Verify server response, not only hidden UI: direct navigation and direct action invocation with forged `hallId`/record ids from another hall/tenant.
- Required cases (§24.4): cross-hall access; customer → employee escalation (customer calls staff action); sales → financial records; unauthorized refund approval; employee → withdrawals/employee admin/platform config; SA → hall financial mutation without financial permission; deactivated user mid-session; role revoked between page load and action (action fails).

## 4. Critical E2E workflows

| ID | Workflow | Asserts |
|---|---|---|
| E2E-01 | Sign in → landing per role → sign out | correct landing; cookie cleared |
| E2E-02 | Check-in reservation → session active → extend → end → invoice Open | one session; invoice not paid; audit rows |
| E2E-03 | Walk-in open session → end → collect cash → invoice Paid | shift linkage; totals from backend |
| E2E-04 | Partial cash + wallet payment | Partially paid then Paid; wallet ledger debit |
| E2E-05 | Double-click / network retry on payment, top-up, check-in, walk-in | exactly one effect (idempotency) |
| E2E-06 | Refund request by employee → approval by owner; employee cannot approve | statuses; reversal visible |
| E2E-07 | Shift close blocked by unpaid invoices → settle → close; override path with reason | gate table matches seed; discrepancy record |
| E2E-08 | Maintenance start shows affected reservations | warning list |
| E2E-09 | Device command LOCK → status timeline (agent stub) incl. timeout = "Outcome unknown" | no retry button for non-idempotent |
| E2E-10 | Owner invites employee → employee accepts → limited nav | permissions applied |
| E2E-11 | Deactivate employee → next request rejected | `/no-access` |
| E2E-12 | SA creates tenant + hall, deactivates tenant | owner loses access |
| E2E-13 | Realtime: session started in tab A appears in tab B; disconnect → refetch | no stale state |
| E2E-14 | Sales agent creates lead; cannot open any finance route | 404/403 |

## 5. Financial workflow tests (web side)

- No financial arithmetic in `src/` except formatting/parsing: ESLint rule + review checklist; unit tests for `parseMoneyInput` (locale separators, max precision per currency, rejects negatives/NaN).
- Every financial action test asserts: idempotency key sent; UI shows backend-returned amounts; error codes `INSUFFICIENT_FUNDS`, `CONFLICT`, `STALE_STATE`, `PRECONDITION_FAILED` mapped to user messages; refetch after success.
- Integration assertion that an `audit_logs` row exists after each sensitive action (REQ-AUD-03).

## 6. Form validation tests

Each Zod schema: valid, boundary, invalid cases. Each dialog: client errors shown inline with `aria-describedby`; server `fieldErrors` mapped to fields; submit disabled while pending.

## 7. Accessibility & responsive

- WCAG 2.2 AA target. axe: zero serious/critical violations. Keyboard-only E2E for check-in, payment, shift close. Focus trap & return in dialogs. Status never conveyed by color alone (badges have text/icons). Timers use `aria-live="off"` with accessible text on demand to avoid noise.
- Layout: no horizontal page scroll at 360 px (tables scroll inside their container).

## 8. Performance

- Budgets: first-load JS for dashboard routes ≤ 200 KB gzip; LCP < 2.5 s, INP < 200 ms on staging (Lighthouse, desktop + mid mobile).
- Device grid renders 200 devices without jank (virtualize if needed); calendar day view for 100 devices.

## 9. Quality gates

| Gate | Required checks |
|---|---|
| Every PR | type-check, lint, format, unit + component tests, build, no service key reference, bundle budget |
| PR touching a feature module | that module's integration tests + authz matrix rows + relevant E2E smoke |
| Phase completion | all tests listed in the phase (WEB_IMPLEMENTATION_PLAN.md) green; a11y scan of new routes; Z matrix updated for new routes/actions; no P0/P1 open bugs |
| Pre-pilot (W11) | full E2E suite on staging, cross-browser, Lighthouse, security checklist (SEC-007), manual Google sign-in smoke |
| Production (W12) | pilot acceptance sign-off, Sentry release health, rollback rehearsed |

Coverage targets (guidance, not a gate on its own): `lib/` ≥ 90 % lines, feature `actions.ts` ≥ 80 %.
