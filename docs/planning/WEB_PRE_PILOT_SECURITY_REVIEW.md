# Pre-pilot security review (SEC-007) — working checklist

Status as of 2026-10-27. **This is not a sign-off.** It separates what is verified by automated checks
from what is only designed or not yet testable (no real Google sign-in, no browser run, no hosted app).

Legend: ✅ verified by an automated check · 🟡 designed and unit-tested, not verified end to end · ❌ not done

## 1. Tenant isolation and authorization

| Check | Status | Evidence / gap |
|---|---|---|
| Clients cannot write any table; SELECT only, `anon` nothing | ✅ | Backend test "table privileges"; same query run on staging after 0009–0011 (SELECT only, anon none) |
| Every client-callable function is on an explicit allowlist; internals are not callable | ✅ | Backend "function exposure" test (82 on staging after 0014; internals none) |
| Every hall RPC re-checks permission (`has_hall_permission`) | ✅ | PGlite tests per feature: other tenant, sales, customer, deactivated users refused |
| Cross-tenant matrix: persona × hall × route | ✅ (unit) | `tests/authz/matrix.test.ts` (web) — **no real-session run** |
| Every Server Action authorizes on the server | ✅ | `tests/security/guards.test.ts` fails CI if an action skips `withPermission`/`withPlatformRole` (one documented exemption: invitation accept) |
| Super admin cannot read hall finance; sales cannot read finance at all | ✅ | Backend tests + staging smoke test (REQ-ADM-04, REQ-SALES-05) |
| Hiding UI is cosmetic only | 🟡 | By design; pages also guard on the server |
| Deactivated tenant/hall/user loses access immediately | ✅ | Backend tests + staging smoke test |
| Last super admin / own role cannot be removed | ✅ | Backend tests + staging smoke test |

## 2. Money and audit

| Check | Status | Evidence / gap |
|---|---|---|
| Integer minor units, no browser arithmetic | 🟡 | Convention + reviewed; the web only parses typed input and formats values. No automated rule yet |
| Money mutations idempotent, atomic, audited | ✅ | PGlite tests for payments, top-ups, refunds, shifts, cash movements |
| History append-only (payments, ledger, cash movements, closed shifts, audit) | ✅ | Trigger tests |
| Balances cannot go negative; overpay refused | ✅ | Tests incl. sequential debits |
| **True parallel concurrency** (double submit from two sessions) | ❌ | `npm run test:concurrency` needs the database password — not run |
| Report categories keep top-ups out of revenue | ✅ | Backend + component tests |

## 3. Secrets and configuration

| Check | Status | Evidence / gap |
|---|---|---|
| No service-role key in `web/` (source, env template, built client bundle) | ✅ | `tests/security/guards.test.ts` (bundle scan runs when `.next/static` exists, also in CI) |
| No secrets in `NEXT_PUBLIC_*` | ✅ | Same test |
| Logs redact tokens, emails, cookies | 🟡 | Logger unit test; no Sentry yet (WEB-008 partial) |
| Invitation tokens stored hashed, shown once | ✅ | Backend tests |

## 4. Web hardening

| Check | Status | Evidence / gap |
|---|---|---|
| Server Action CSRF (Origin vs Host) | 🟡 | Provided by Next.js; not tested here |
| Server Action body limit | ✅ config | `serverActions.bodySizeLimit: 100kb` (was 1MB default); verified by build only |
| Static security headers | 🟡 | nosniff, frame deny, HSTS, referrer, permissions, plus CSP `frame-ancestors/base-uri/form-action/object-src`. Not inspected on a running server |
| **Nonce-based script CSP** | ❌ | Needs dynamic rendering of every page; open decision |
| Open-redirect protection on `?next=` | ✅ | `safeNext` tests |
| Dependency audit | ✅ | `npm audit --omit=dev`: 0 vulnerabilities (web, 2026-10-27) |

## 5. Database advisor (staging, 2026-10-27)

- Security: only the intended warnings (`authenticated_security_definer_function_executable` for the 76 RPCs, each checks permission inside) and `rls_enabled_no_policy` for `hall_invitations` / `invoice_counters` (deliberate: no client access).
- Performance: 5 `auth_rls_initplan` warnings and 45 unindexed-foreign-key notes. **Migration 0012 (applied to staging 2026-10-27) fixed the five policies (warning gone) and indexed the hot foreign keys (45 notes down to 32; the rest are audit/actor columns, left unindexed on purpose).** The new indexes show as "unused" only because staging has no data yet.

## 6. Not testable yet (blockers outside the code)

1. Google OAuth setup and the first owner bootstrap (`backend/scripts/bootstrap-staging.sql`).
2. Real-session end-to-end tests (Playwright) — need a signed-in user.
3. Accessibility crawl (axe) and responsive screenshots on real pages.
4. Performance budgets (Lighthouse) — need a deployed build.
5. True concurrency run.
6. A real Windows Agent (command results are only visible, never produced, by the web).
7. Business decisions still provisional: DEC-01 (permission matrix), DEC-05/10 (pricing, tax), DEC-08 (refunds), DEC-11/W14 (shift gate), DEC-W13, DEC-W15, DEC-W16.

## 7. Sign-off

Not signed off. Required before a pilot: items 1–5 of §6 done and green, the provisional decisions
confirmed or consciously accepted by the owner, and the unused-index notes re-checked once there is real traffic.
