# Prompt to continue in a new session

Paste everything below the line into a new Claude Code session opened in `C:\Users\VIP\Desktop\gaming hall saas`.

---

You are continuing work on the Gaming Hall SaaS platform in this folder. Scope: the Next.js web dashboard (`web/`) and the shared Supabase backend (`backend/`). Do NOT create the Flutter app or the Windows Agent (`mobile/`, `windows-agent/` stay empty).

## Read first (source of truth)
1. `Gaming_Hall_SaaS_Master_Specification.pdf` (v2.0). Extract text with `pdftotext` or pypdf if needed.
2. `web/docs/planning/*.md`: plan, requirements traceability, page inventory, API contracts, testing strategy, risks and decisions, backlog, milestones, and **`WEB_IMPLEMENTATION_STATUS.md` (the real status; trust it over the plan)**.
3. `backend/README.md` (migrations, staging project, findings, how to run tests).
4. `web/AGENTS.md`: this Next.js (16.x) differs from older versions. Read `web/node_modules/next/dist/docs/` before writing Next code (e.g. `proxy.ts` replaces middleware; request data must be read inside `<Suspense>`).

## Where things stand
- Phases W1 to W8 are built, and W9 (shifts, registers, basic report) and W10 (platform admin and sales) are built but unverified in a browser; migration 0010 is applied to staging and smoke-tested. (Earlier text:)  W1 setup, W2 design system and shell, W3 Google auth and protected routes, W4 hall guards and permissions, W5 hall settings/employees/audit, W6 devices/maintenance/Agent visibility/commands, W7 reservations and sessions, W8 pricing, invoices, cash payments, wallets, refunds.
- Next phase: **W11** integration, security validation and performance, then W12 release (P2 extras: expenses, advanced reports, CSV export, cross-hall search, monitoring, platform settings, sales reports, notifications remain). Since 0010, cash payments, cash top-ups and cash refunds require an open shift.
- Backend: `backend/supabase/migrations/0001` to `0014` (SQL, tested on PGlite: `cd backend && npm test`, currently 221 tests; 0010 to 0012 applied to staging). Web: `cd web && npm run typecheck && npm run lint && npm test && npm run build` (711 tests at last run).
- Staging Supabase project **gaming-hall-saas-staging** (ref `eojzkikvlviignmjxkhn`, eu-central-2) has migrations 0001 to 0009 applied, reference data only (no users/halls). `web/.env.local` points at it (public URL and publishable key only).

## Rules that must keep holding
- The database/trusted RPCs are the source of truth for permissions, availability, pricing, invoices, payments, wallets, shifts. The web only displays and requests. No money arithmetic in the browser; amounts are integer minor units + currency; typed amounts are converted on the server with the hall/invoice currency.
- Every page and Server Action authorizes on the server (`requireHallPermission`, `withPermission`) AND the RPC re-checks. Hiding UI is cosmetic.
- Money/session mutations are idempotent (key per user intent, reused on retry), atomic, audited (`write_audit`), and history is append-only (corrections are new records).
- No service-role key in `web/`. Clients are read-only on tables (SELECT only); writes go through SECURITY DEFINER RPCs with fixed `search_path`; each new RPC must be added to the exposure allowlist test in `backend/tests/hall_management.test.ts`.
- On real Supabase, new tables inherit default grants unless migration 0009's default-privilege revoke applies; the PGlite stubs reproduce Supabase defaults and tests assert SELECT-only grants. Keep new tables RLS-enabled with explicit SELECT grants only.
- Provisional business rules are marked in code and docs (DEC-xx in `WEB_RISKS_AND_DECISIONS.md`); never present assumptions as decided.

## Working method
- Backend first (new migration file, PGlite tests incl. cross-tenant, permission, idempotency and audit cases), then web (schemas, queries, actions with mocked-RPC tests, pages, component tests), then typecheck, lint, format (`npx prettier --check .`), tests, build. Update `WEB_IMPLEMENTATION_STATUS.md` honestly ("In progress" until verified end to end).
- Be honest about what is unverified (no browser run yet, no real Google sign-in, no true parallel concurrency, no real Agent).
- **Ask me before touching any hosted Supabase project** (applying migrations, running SQL). Applying to staging is allowed only after I approve each migration; after applying, re-run: the function-exposure query, the table-privilege query, and a rolled-back smoke test (a `DO` block that raises at the end so nothing persists). Never touch my other projects (`gaming-cafe`, `demovio-dash`).
- Windows machine, no Docker, no psql; the Supabase tools in the session are the way to reach staging. The Bash tool strips some backslashes in heredocs; for regex or escaped text use the Write/Edit tools or a small Node script.

## Pending items I will do myself (do not block on them)
- Google OAuth setup (steps in `backend/README.md`), running `backend/scripts/bootstrap-staging.sql` after first sign-in, and the true concurrency run `npm run test:concurrency` in `backend/` (needs the database password).

## First task
Start W9 (shifts, registers, reports) per `WEB_PAGE_INVENTORY.md` H1 to H5 and `WEB_TASK_BACKLOG.md` ACC-*: backend migration first (registers, shifts with open/close, unpaid-invoice gate before closing with permitted override + reason, cash movements, link cash payments/top-ups/cash refunds to the open shift, basic reports with correct accounting meaning: top-ups are not revenue), then the web pages. Show me the plan briefly, then proceed.
