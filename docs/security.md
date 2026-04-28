# Security

---

## RLS Policies

Row Level Security (RLS) is enabled on all tables. Run the following files from `supabase/` in Supabase SQL Editor:

| File | Table |
|------|-------|
| `profiles_rls.sql` | `profiles` |
| `hall_devices_rls.sql` | `hall_devices` |
| `reservations_rls_optimized.sql` | `reservations` |
| `products_rls_optimized.sql` | `products` |

### Policy Summary

**`profiles`**
- Users can read and update their own profile
- `super_admin` can do everything
- Insert allowed on signup (`auth.uid() = id`)

**`hall_devices`**
- All authenticated users can read
- Only `super_admin` can insert/update/delete

**`reservations`**
- Users can read/write their own reservations
- Staff can read/write reservations for their assigned halls
- `super_admin` has full access

**`products`**
- Staff assigned to the hall can read/write
- `super_admin` has full access

### Enabling RLS on a Table

```sql
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
```

> Never disable RLS on tables that contain user or financial data.

---

## API Route Protection

Every API route is protected at two levels:

### 1. Middleware (automatic)

`middleware.ts` runs on every request and:
- Redirects unauthenticated users to `/auth/login`
- Refreshes Supabase session cookies

### 2. Route-level checks

Each route handler performs its own auth check:

**Pattern used across all routes:**
```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

**Staff/Manager access check:**
```ts
const accessResult = await verifyStaffHallAccess(user.id, hall_id);
if (!accessResult.success) return NextResponse.json({ error: accessResult.error }, { status: 403 });
```

**Super admin check (admin routes):**
```ts
const gate = await assertSuperAdmin();
if (!gate.ok) return gate.response; // returns 401 or 403
```

**Cron job protection (use constant-time comparison to prevent timing attacks):**
```ts
import { timingSafeEqual } from "crypto";

const authHeader = request.headers.get("Authorization") ?? "";
const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;
const a = Buffer.from(authHeader);
const b = Buffer.from(expectedSecret);
if (a.length !== b.length || !timingSafeEqual(a, b)) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

---

## Environment Variables Security

> **Three mandatory rules for every secret below:**
> 1. **Server-only** — never expose to the client or include in `NEXT_PUBLIC_*` variables
> 2. **Never commit to version control** — keep in `.env.local` (gitignored)
> 3. **Store in deployment environment** — set in Vercel → Settings → Environment Variables

| Variable | Notes |
|----------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only — bypasses RLS; never expose to client |
| `OTP_SECRET` | Server-only — used to HMAC-hash OTP codes and derive encryption keys |
| `CRON_SECRET` | Server-only — protects job routes from unauthorized triggers |
| `AGENT_SERVER_SECRET` | Server-only — shared secret between Next.js and local agent server |
| `SMTP_PASSWORD` | Server-only — Gmail App Password; never commit to git |

---

## OTP Security

- OTP codes are **never stored in plaintext** — stored as HMAC-SHA256 hash using `OTP_SECRET`
- Codes expire after a short TTL (`expires_at`)
- Failed attempts are tracked (`attempts` column) — implement lockout if needed
- `used` flag prevents replay attacks
