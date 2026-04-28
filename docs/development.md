# Development Guide

## Folder Structure

```
gaming-hub/
├── app/
│   ├── [locale]/               # All UI routes (ar/en prefix)
│   │   ├── (dashboard)/        # Route group — shared dashboard layout
│   │   │   ├── halls/          # /halls — hall listing (super_admin + player)
│   │   │   └── reservations/   # /reservations — player reservations
│   │   ├── admin/              # /admin — super_admin panel
│   │   │   ├── halls/          # Manage all halls
│   │   │   └── users/          # Manage all users
│   │   ├── auth/               # Auth pages
│   │   │   ├── login/          # Login + signup (combined)
│   │   │   ├── verify-otp/     # OTP entry
│   │   │   ├── callback/       # Supabase auth callback
│   │   │   └── set-username/   # First-time username setup
│   │   └── dashboard/[hallId]/ # Hall dashboard (staff/manager)
│   └── api/                    # API routes (no UI)
│       ├── admin/              # super_admin only endpoints
│       ├── auth/               # OTP auth endpoints
│       ├── agent/              # Agent command proxy
│       ├── jobs/               # Cron job endpoints
│       ├── sessions/           # Session management
│       ├── reservations/       # Reservation CRUD
│       ├── products/           # Product management
│       ├── wallets/            # Wallet operations
│       └── dashboard/          # Dashboard data endpoints
│
├── components/
│   ├── layout/                 # Sidebar, header
│   └── ui/                     # Reusable UI components (shadcn + custom)
│
├── lib/
│   ├── supabase/               # Supabase clients (server, client, admin, middleware)
│   ├── jobs/                   # Cron job logic (pure functions, no HTTP)
│   ├── query/                  # TanStack Query client + provider
│   ├── agent.ts                # Agent HTTP client
│   ├── audit.ts                # Audit log writer
│   ├── email.ts                # Nodemailer SMTP
│   ├── otp.ts                  # OTP generation
│   ├── otp-hash.ts             # HMAC hashing
│   ├── pricing.ts              # Duration + price calculation
│   └── env.ts                  # Typed env variable access
│
├── services/                   # Database operations (called from API routes)
│   ├── access.ts               # Role/permission checks
│   ├── sessions.ts             # Session CRUD
│   ├── reservations.ts         # Reservation CRUD
│   ├── wallets.ts              # Wallet operations
│   ├── cash-registers.ts       # Cash register operations
│   └── ...
│
├── types/                      # TypeScript types
├── schemas/                    # Zod validation schemas (used in API routes)
├── messages/                   # i18n translations (ar.json, en.json)
├── supabase/                   # SQL migration files
├── docs/                       # Project documentation
└── middleware.ts               # Root middleware (next-intl + Supabase auth)
```

---

## Coding Standards

### API Routes
Every route follows this pattern:
1. Parse + validate body with Zod schema
2. Get authenticated user via `supabase.auth.getUser()`
3. Check permissions (`verifyStaffHallAccess` / `assertSuperAdmin`)
4. Call service function(s)
5. Return typed JSON response

```ts
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = mySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check permissions before calling service
  const access = await verifyStaffHallAccess(user.id, parsed.data.hall_id);
  if (!access.success) return NextResponse.json({ error: access.error }, { status: 403 });

  const result = await myService(parsed.data);
  if (!result.success) {
    // Map errorCode to HTTP status
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      CONFLICT:  409,
      FORBIDDEN: 403,
      VALIDATION: 400,
    };
    const status = result.errorCode ? (statusMap[result.errorCode] ?? 500) : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result.data, { status: 201 });
}
```

### Service Functions
All service functions return `ServiceResult<T>`:
```ts
type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode?: string };
```

Use `errorCode` to signal specific failure types (`NOT_FOUND`, `CONFLICT`, `VALIDATION`, `FORBIDDEN`) so route handlers can map them to the correct HTTP status.

### Supabase Clients

| Client | File | Use case |
|--------|------|----------|
| Server | `lib/supabase/server.ts` | API routes, Server Components |
| Client | `lib/supabase/client.ts` | Client Components |
| Admin | `lib/supabase/admin.ts` | Bypasses RLS — admin operations only |
| Middleware | `lib/supabase/middleware.ts` | Session refresh in middleware |

> Never use the admin client in regular API routes. Only use it where RLS must be bypassed (e.g. creating users, cron jobs).

### Environment Variables
Always access env vars through `lib/env.ts` typed getters — never use `process.env.X` directly in route files.

---

## Troubleshooting

### OTP email not sending
- Check `SMTP_PASSWORD` is a Gmail **App Password** (not your account password)
- Ensure 2-Step Verification is enabled on the Gmail account
- Check server logs for `[request-otp]` errors

### "No valid OTP request found" on verify
- OTP has expired — default TTL is short, ask user to request a new one
- Check `otp_codes` table: `used = true` means it was already consumed

### Reservation overlap error (409)
- The PostgreSQL exclusion constraint is working correctly
- Check `reservations` table for existing rows with overlapping `tstzrange`
- Cancelled/completed reservations don't block new bookings

### Staff redirected to `/halls` instead of dashboard
- Check `staff_assignments` table — user must have a row with their `user_id` and `hall_id`
- Assign via `POST /api/admin/staff-assignments`

### Agent command returns 502
- Agent server is not running or not reachable
- Check `AGENT_SERVER_URL` points to the correct address
- If using ngrok, the URL changes on restart — update env var

### RLS blocking queries
- Ensure RLS policies are applied — run SQL files in `supabase/` directory
- Use Supabase Dashboard → Table Editor → RLS to verify policies are active
- Admin client (`lib/supabase/admin.ts`) bypasses RLS if needed for debugging

### Cron jobs not running
- Verify `CRON_SECRET` matches between env var and cron service config
- Test manually: `curl -X POST https://your-app.vercel.app/api/jobs/process-reservation-statuses -H "Authorization: Bearer <secret>"`
- Check Vercel function logs for errors
