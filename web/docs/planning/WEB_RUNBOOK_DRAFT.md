# Web runbook — DRAFT (DEPLOY-004)

Nothing here has been exercised: there is no hosted web app yet, no Vercel project, and this folder is
not a git repository. Treat it as a starting point to correct during the first staging deploy.

## Environments

| Env | Supabase project | Notes |
|---|---|---|
| staging | `gaming-hall-saas-staging` (ref `eojzkikvlviignmjxkhn`, eu-central-2) | Migrations 0001–0014 applied |
| production | not created | Create only after the pilot checklist is signed off |

Web environment variables (public only; see `web/.env.example`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable key), `NEXT_PUBLIC_APP_URL`, `APP_ENV`.
**Never** set a service-role key for the web app.

## Deploy (proposed)

1. CI green on the commit (typecheck, lint, format, tests, build, audit).
2. Apply any new migration to staging first, **only after explicit owner approval**; then re-run the
   function-exposure query, the table-privilege query and a rolled-back smoke test.
3. Deploy the web build to staging; check `/login`, sign in, open a hall.
4. OAuth redirect URLs per environment must match `NEXT_PUBLIC_APP_URL` (DEPLOY-002).
5. Promote to production the same way after the pilot sign-off.

## Rollback

- **Web:** redeploy the previous build (hosting provider's instant rollback).
- **Database:** migrations are forward-only. A bad migration is fixed by a new migration, not by
  editing history. Take a backup/branch before any production migration. Money history is append-only:
  corrections are new records, never deletes.

## Incident checklist

1. Is it auth (cannot sign in) or authorization (403/404)? Check Supabase Auth logs and `get_my_context`.
2. Is the database reachable? Check the Supabase project status and the advisors.
3. Money looks wrong: do **not** edit rows. Use the audit log (`audit_logs`) and the cash movement /
   wallet ledger to reconstruct; fix with a refund, void or cash adjustment (each is audited).
4. Suspected cross-tenant exposure: deactivate the tenant (`admin_set_tenant_status`) to cut access,
   then investigate with the audit log.
5. Record what happened and what changed in this folder.

## Open items

- Pick and create the hosting project (Vercel assumed), env vars, and OAuth redirect URLs.
- Add Sentry (releases, source maps, scrubbing) — WEB-008 / DEPLOY-003.
- Decide on backups / point-in-time recovery for production.
