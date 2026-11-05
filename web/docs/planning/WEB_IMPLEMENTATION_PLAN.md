# Web Implementation Plan — Gaming Hall SaaS Dashboard

**Scope**: Next.js web dashboard (`web/`) only. Mobile (Flutter) and Windows Agent are separate applications; backend capabilities are prerequisites (`WEB_API_AND_DATA_CONTRACTS.md` §9).
**Source**: Master Specification v2.0 (Oct 2026). **Status**: planning only — no application code exists; `web/` and `backend/` were empty when inspected on 2026-10-24.

Companion documents:
| Doc | Content |
|---|---|
| `WEB_ARCHITECTURE.md` | stack, structure, routes, diagram, auth boundaries |
| `WEB_REQUIREMENTS_TRACEABILITY.md` | REQ-* mapping to spec, pages, tasks, tests |
| `WEB_PAGE_INVENTORY.md` | page-by-page specification |
| `WEB_API_AND_DATA_CONTRACTS.md` | backend operations, financial ownership, prerequisites, shared contracts |
| `WEB_TESTING_STRATEGY.md` | test layers, matrices, gates |
| `WEB_RISKS_AND_DECISIONS.md` | ADRs, open decisions, risks |
| `WEB_TASK_BACKLOG.md` | tasks with IDs |
| `WEB_MILESTONES_AND_ESTIMATES.md` | milestones, effort, MVP |
| `WEB_IMPLEMENTATION_STATUS.md` | tracker |

## 1. Guiding rules

1. The database/trusted backend is the authority for availability, pricing, invoices, payments, wallets, shifts and permissions (§1.3, §29). The web displays and requests.
2. Every page and action is authorized server-side; hiding UI is cosmetic only.
3. All financial/session mutations carry an idempotency key and are refetched after success.
4. No service-role credentials in the web runtime.
5. Unresolved business rules are tracked as DEC-* and never silently decided in code.

## 2. Phases

Estimates are engineer-days of task effort (from backlog) plus ~25 % for review, integration and fixes. "Tests" list what must be green for phase completion (see `WEB_TESTING_STRATEGY.md` §9).

### W0 — Specification analysis & decisions (this document set)
- **Objectives**: confirm web scope, contracts, decisions needed.
- **Prerequisites**: spec.
- **Tasks**: review these documents with product & backend owners; resolve DEC-01, DEC-17, DEC-W01 (critical); schedule DEC-02/03/05/08/11.
- **Deliverables**: approved planning docs; decision register owners and dates.
- **Acceptance**: DEC-01 and DEC-W01 decided or have dates before W4.
- **Risks**: R-01, R-02. **Estimate**: 2–3 days (product + architect). **DoD**: sign-off recorded in `WEB_RISKS_AND_DECISIONS.md`.

### W1 — Project setup & engineering standards
- **Objectives**: reproducible project with quality gates.
- **Prerequisites**: W0; BE-PREREQ-01 for WEB-007 (may finish later).
- **Ordered tasks**: WEB-001 → WEB-002 → (WEB-003, WEB-004, WEB-006 parallel) → WEB-005 → WEB-008 → WEB-007 → SEC-003 → DEPLOY-001 → WEB-009.
- **Files**: root config, `src/lib/env.ts`, `src/lib/logger.ts`, CI workflow.
- **Backend deps**: local Supabase + schema for type generation.
- **Deliverables**: CI pipeline, preview deployments.
- **Acceptance**: PR shows typecheck/lint/unit/build/e2e-smoke; secret guard active.
- **Tests**: sample unit/e2e; env validation unit tests.
- **Risks**: none significant. **Estimate**: 7 days. **DoD**: new contributor runs app & tests from README in < 30 min.

### W2 — Design system & application shell
- **Objectives**: accessible components and shell used by every module.
- **Prerequisites**: W1.
- **Ordered tasks**: UI-001 → UI-002 → (UI-003, UI-004, UI-005, UI-006, UI-007, UI-008 parallel) → UI-009; API-001, API-002, API-005 in parallel.
- **Files**: `src/components/**`, `src/lib/money.ts`, `src/lib/dates.ts`, `src/lib/actions/*`.
- **Backend deps**: none (MSW).
- **Deliverables**: shell with permission-aware nav config, DataTable, domain components.
- **Acceptance**: axe clean on demo routes; responsive at 3 viewports; money/TZ unit tests pass.
- **Tests**: U, C, A, responsive.
- **Risks**: over-engineering components — build only what pages in W5–W7 need. **Estimate**: 14 days. **DoD**: components documented with usage examples in code comments; tests green.

### W3 — Authentication & protected routes
- **Objectives**: Google sign-in, session handling, landing.
- **Prerequisites**: W1; BE-PREREQ-02, BE-PREREQ-03.
- **Ordered tasks**: AUTH-001 → AUTH-002 → AUTH-003 → AUTH-006 → AUTH-004 → AUTH-005 → AUTH-007 → AUTH-010 → SEC-002 → SEC-001 → AUTH-011.
- **Files**: `middleware.ts`, `src/lib/supabase/*`, `src/lib/auth/*`, `(public)`, `auth/*`, `(gate)`.
- **Backend deps**: Google provider, profile creation, `get_my_context`.
- **Deliverables**: working login/logout across environments.
- **Acceptance**: REQ-AUTH-01..05 criteria; customer-only → `/no-access`.
- **Tests**: E2E-01, U (redirect sanitizer, landing resolver), I (context loader).
- **Risks**: R-08. **Estimate**: 9 days. **DoD**: §24.1 cases automated except real Google (manual staging smoke).

### W4 — Tenant-aware access & permission handling
- **Objectives**: hall scoping, permission guards, authz test framework.
- **Prerequisites**: W3; DEC-01; BE-PREREQ-04, -08, -14, -15.
- **Ordered tasks**: API-003 → AUTH-009 → UI-010 → AUTH-008 → TEST-001 → TEST-002 → SEC-004 (initial) → SEC-005 → SEC-006 → API-004 → API-006 (rolling).
- **Files**: `src/lib/auth/guards.ts`, `halls/[hallId]/layout.tsx`, `src/contracts/*`, `tests/integration/authz/*`.
- **Deliverables**: guard API used by all later pages; matrix that new routes must extend.
- **Acceptance**: REQ-TEN-01..07; forged hall ids → 404; missing permission → 403.
- **Tests**: Z matrix, cross-tenant suite.
- **Risks**: R-02. **Estimate**: 12 days. **Critical path**. **DoD**: matrix runs in CI and blocks merge.

### W5 — Core hall module (overview, settings, employees)
- **Objectives**: owners can configure a hall and its staff.
- **Prerequisites**: W4; BE-PREREQ-05.
- **Ordered tasks**: HALL-002 → HALL-003 → HALL-004 → HALL-005 → EMP-001 → EMP-002 → EMP-003 → EMP-004 → HALL-001 (overview needs devices/sessions data; finish after W6 data exists, show partial KPIs first) → AUD-001.
- **Deliverables**: settings, employees, hall audit log.
- **Acceptance**: REQ-HALL-01..05, REQ-EMP-01..04, REQ-AUD-01; audit rows for each change.
- **Tests**: I + Z per page; E2E-10, E2E-11.
- **Risks**: DEC-02/03 defaults undecided — show "proposed default". **Estimate**: 18 days.
- **Note**: employees moved earlier than spec phase ordering because invitations are needed to test every later role.

### W6 — Devices, maintenance & Agent visibility
- **Prerequisites**: W4; BE-PREREQ-06, -09, -10.
- **Ordered tasks**: DEV-001 → DEV-002 → DEV-003 → DEV-004 → DEV-005 → AGT-001 → AGT-003 → AGT-002 → AGT-004.
- **Acceptance**: REQ-DEV-01..04, REQ-AGT-01..04, REQ-RT-01.
- **Tests**: E2E-08, E2E-09, E2E-13; C for state rendering.
- **Risks**: R-04, R-10. **Estimate**: 15 days.

### W7 — Reservations & sessions
- **Prerequisites**: W6; BE-PREREQ-07 (+ pricing snapshot/quote from BE-PREREQ-11 for walk-in quote).
- **Ordered tasks**: RES-001 → RES-004 → RES-002 → SES-001 → RES-005 → RES-006 → SES-002 → SES-004 → SES-003 → RES-007 → SES-006 → SES-007 → SES-005 → RES-003 → TEST-006.
- **Acceptance**: REQ-RES-01..07, REQ-SES-01..07.
- **Tests**: E2E-02, E2E-05 (check-in/walk-in), I for conflicts and idempotency.
- **Risks**: R-05, R-07; DEC-03. **Estimate**: 24 days. **Critical path**.

### W8 — Pricing, invoices, payments, wallets
- **Prerequisites**: W7; BE-PREREQ-11, -12; DEC-05, -06, -08.
- **Ordered tasks**: PRC-001 → FIN-001 → FIN-002 → FIN-009 → ACC-001 (needed for cash) → FIN-003 → WAL-001 → WAL-002 → FIN-004 → WAL-003 → FIN-005 → FIN-006 → FIN-007 → FIN-008 → PRC-004 → PRC-005 → PRC-002 → PRC-003 → WAL-005 → WAL-004.
- **Acceptance**: REQ-PRC-01/06, REQ-INV-01..08, REQ-WAL-01..03 (P1 items when decisions allow).
- **Tests**: TEST-003 subset (E2E-03..06), Z for every financial action, audit asserts.
- **Risks**: R-03, R-06 (critical). **Estimate**: 32 days. **Critical path**.

### W9 — Shifts, registers & reports
- **Prerequisites**: W8; BE-PREREQ-13; DEC-11, DEC-W08, DEC-10.
- **Ordered tasks**: ACC-002 → ACC-003 → ACC-004 → ACC-007 → ACC-005 → ACC-009 → EMP-005 → HALL-001 (complete KPIs).
- **Acceptance**: REQ-ACC-01..05, -07, -09.
- **Tests**: E2E-07, report I tests verifying categories match backend.
- **Risks**: R-11. **Estimate**: 12 days.

### W10 — Administration, sales, notifications & advanced features
- **Prerequisites**: W4 (admin can start in parallel after W4); BE-PREREQ-16; DEC-16, DEC-17.
- **Ordered tasks**: ADM-001 → ADM-002 → ADM-003 → ADM-004 → ADM-005 → AUD-002 → NTF-002 → SALES-001..006 → (P2: ADM-006..008, SALES-007, ACC-006, ACC-008, RES-008, RISK-001, NTF-001).
- **Acceptance**: REQ-ADM-01..05, REQ-SALES-01..03, -05; REQ-AUD-02.
- **Tests**: E2E-12, E2E-14, Z rows for SA/SAG/SAD.
- **Note**: tenant provisioning (ADM-002..004) is needed before a pilot hall can be onboarded, so it is MVP and can run on a parallel track from W5.
- **Estimate**: MVP part 9 days; sales 10 days; P2 extras ~22 days.

### W11 — Integration, security validation & performance
- **Prerequisites**: W5–W9 (+ MVP part of W10); real Agent available for pilot hardware tests.
- **Tasks**: TEST-003 complete, TEST-004, TEST-005, TEST-007, SEC-004 complete, SEC-007 review, bug fixing, staging rehearsal with seeded pilot hall.
- **Acceptance**: all gates in `WEB_TESTING_STRATEGY.md` §9 "Pre-pilot".
- **Estimate**: 10 days.

### W12 — Deployment & production release
- **Tasks**: DEPLOY-002, DEPLOY-003, DEPLOY-004, DEPLOY-005 (one-hall pilot), feedback fixes, DEPLOY-006.
- **Acceptance**: §28 Definition of Done items applicable to web; pilot sign-off.
- **Estimate**: 6 days + pilot duration (calendar, not effort).

## 3. Critical path & parallelism

Critical path: **W0 (DEC-01) → W1 → W3 → W4 → W6 → W7 → W8 → W9 → W11 → W12**, gated throughout by backend prerequisites (the larger risk).

Can run in parallel:
- W2 (design system) alongside W1/W3.
- W5 settings/employees alongside W6 devices once W4 is done.
- W10 admin/tenant provisioning from W5 onward (second engineer).
- Sales (W10c) any time after W4 + BE-PREREQ-16.
- MSW-backed UI work for W7–W9 can start before backend RPCs exist; integration tests are completed when backend lands.

## 4. Backend dependency timeline (to share with backend team)

| Needed by start of | Backend prerequisites |
|---|---|
| W1 | BE-PREREQ-01, -15 (initial) |
| W3 | BE-PREREQ-02, -03 |
| W4 | BE-PREREQ-04, -08, -14 |
| W5 | BE-PREREQ-05 |
| W6 | BE-PREREQ-06, -09, -10 |
| W7 | BE-PREREQ-07 |
| W8 | BE-PREREQ-11, -12 |
| W9 | BE-PREREQ-13 |
| W10 | BE-PREREQ-16, (-17 for expenses) |

## 5. Pre-pilot security checklist (SEC-007)
- [ ] No service-role key or secret in repo, env of web runtime, or client bundle.
- [ ] Every route under `(app)` uses a guard; every Server Action calls `withPermission` and an RPC that re-checks.
- [ ] Authz matrix covers all routes/actions; cross-tenant suite green.
- [ ] No financial arithmetic outside `money.ts` formatting/parsing.
- [ ] Idempotency key on all mutations listed in contracts §5.
- [ ] CSP/headers verified on staging; `next` redirect sanitized.
- [ ] Errors/logs scrubbed; Sentry PII off.
- [ ] Realtime channels private and RLS-authorized.
- [ ] Dependency audit (`pnpm audit`) with no high/critical.
- [ ] Sign-out and deactivation verified on staging with real Google account.
