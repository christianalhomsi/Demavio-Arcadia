# Arcadia - Gaming Hub Management System

A comprehensive gaming hall management system built with Next.js 15, Supabase, and TypeScript.

## Features

- 🎮 **Multi-Hall Management** - Manage multiple gaming halls from one platform
- 📅 **Reservation System** - Book gaming sessions with real-time availability
- 💰 **Financial Management** - Track transactions, cash registers, and audit logs
- 👥 **User Management** - Role-based access control (Admin, Manager, Staff, Player)
- 🌐 **Multi-language Support** - Arabic (default) and English
- 📧 **OTP Authentication** - Secure login with email verification
- 🎯 **Agent System** - Remote device management and control
- 📊 **Dashboard & Analytics** - Real-time insights and reporting

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth + Custom OTP
- **Styling:** Tailwind CSS 4
- **UI Components:** Shadcn/ui
- **State Management:** TanStack Query
- **Email:** Nodemailer (Gmail SMTP)
- **Internationalization:** next-intl

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- Supabase account
- Gmail account with App Password

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd gaming-hub
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env.local
```

4. Configure your `.env.local` file with your credentials

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

See `.env.example` for required environment variables.

### Gmail SMTP Setup

1. Enable 2-Step Verification in your Google Account
2. Go to [App Passwords](https://myaccount.google.com/apppasswords)
3. Generate a new app password for "Mail"
4. Use the 16-character password in `SMTP_PASSWORD`

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── [locale]/          # Internationalized routes
│   ├── api/               # API routes
│   └── globals.css        # Global styles
├── components/            # React components
├── lib/                   # Utility functions
├── services/              # Business logic
├── types/                 # TypeScript types
├── messages/              # i18n translations
├── supabase/             # Database migrations
└── middleware.ts          # Root middleware (auth + i18n)
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

---

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `profiles` | User profiles linked to Supabase Auth (`id`, `email`, `username`, `role`, `created_at`) |
| `halls` | Gaming halls (`id`, `name`, `description`, `owner_id`, `is_active`) |
| `hall_devices` | Devices inside each hall (`id`, `hall_id`, `name`, `type_id`, `status`, `price_per_hour`) |
| `device_types` | Device categories e.g. PS5, PC (`id`, `hall_id`, `name`) |
| `staff_assignments` | Links staff/managers to halls (`user_id`, `hall_id`) |
| `reservations` | Booking records (`id`, `hall_id`, `device_id`, `user_id`, `guest_name`, `start_time`, `end_time`, `status`) |
| `sessions` | Active gaming sessions (`id`, `device_id`, `hall_id`, `user_id`, `started_at`, `ended_at`, `total_price`) |
| `session_items` | Products consumed during a session (`id`, `session_id`, `product_id`, `quantity`, `price`) |
| `products` | Hall products/snacks (`id`, `hall_id`, `name`, `price`, `stock`) |
| `wallets` | Player wallet balances (`id`, `user_id`, `hall_id`, `balance`) |
| `transactions` | Financial transactions (`id`, `hall_id`, `user_id`, `amount`, `type`, `reference_id`) |
| `cash_registers` | Cash register state per hall (`id`, `hall_id`, `opened_by`, `opened_at`, `closed_at`, `opening_balance`) |
| `invoices` | Session invoices (`id`, `session_id`, `hall_id`, `total`, `paid`, `created_at`) |
| `otp_codes` | OTP verification codes (`id`, `email`, `username`, `code_hash`, `expires_at`, `used`) |
| `audit_logs` | Admin action audit trail (`id`, `actor_id`, `action`, `target_id`, `metadata`, `created_at`) |
| `working_hours` | Hall operating hours per day (`id`, `hall_id`, `day_of_week`, `open_time`, `close_time`) |

### Key Relationships

```
profiles ──< staff_assignments >── halls
halls ──< hall_devices
halls ──< device_types
hall_devices ──< reservations
hall_devices ──< sessions ──< session_items >── products
profiles ──< wallets >── halls
sessions ──< invoices
```

---

## Roles & Permissions

| Role | Access |
|------|--------|
| `super_admin` | Full access to all halls, users, settings, and admin panel |
| `hall_manager` | Manage their assigned hall: devices, staff, reservations, sessions, reports |
| `hall_staff` | Operate their assigned hall: check-in, sessions, products |
| `player` | View and book reservations, manage their own wallet |

### Auth Flow

1. User enters email → OTP sent via Gmail SMTP
2. User enters OTP → verified against hashed code in `otp_codes`
3. On success → Supabase session created
4. Middleware checks role → redirects to correct dashboard

### Middleware (`middleware.ts`)

The root `middleware.ts` chains two layers:
1. **next-intl** – handles locale prefix routing (`/ar/...`, `/en/...`)
2. **Supabase session** – refreshes auth cookies and enforces route protection

Unauthenticated users are redirected to `/{locale}/auth/login`.  
Authenticated users on login page are redirected based on role:
- `hall_manager` / `hall_staff` → `/dashboard/{hall_id}`
- `super_admin` / others → `/halls`

---

## Agent System

The Agent is a separate local server running on each gaming hall's machine. It receives commands from the Next.js backend to control devices remotely.

### How It Works

```
Next.js API  →  POST /api/agent/command  →  lib/agent.ts  →  Agent Server (local)
```

1. Staff triggers an action (pause device, end session, etc.)
2. API route calls `sendAgentCommand(payload)` in `lib/agent.ts`
3. The function sends a `POST` request to `AGENT_URL/command` with `Authorization: Bearer <AGENT_SECRET>`
4. The local agent server executes the command on the device

### Environment Variables

```env
AGENT_URL=http://localhost:4000   # Local agent server URL
AGENT_SECRET=your-secret-token   # Shared secret for auth
```

### Supported Commands

Defined in `types/agent.ts` — commands include device lock/unlock, session control, and status updates.

---

## Cron Jobs

Automated background jobs are exposed as API routes under `/api/jobs/` and triggered by an external cron service (e.g. Vercel Cron, GitHub Actions, or cron-job.org).

| Route | Job | Frequency |
|-------|-----|-----------|
| `/api/jobs/cancel-expired-reservations` | Cancels reservations past their end time without check-in | Every 5 min |
| `/api/jobs/process-reservation-statuses` | Updates reservation statuses (upcoming → active → completed) | Every 1 min |
| `/api/jobs/send-reservation-reminders` | Sends email reminders before reservation start | Every 15 min |
| `/api/jobs/mark-offline-devices` | Marks devices as offline if agent hasn't pinged recently | Every 2 min |

### Setup with Vercel Cron

Add to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/jobs/process-reservation-statuses", "schedule": "* * * * *" },
    { "path": "/api/jobs/cancel-expired-reservations", "schedule": "*/5 * * * *" },
    { "path": "/api/jobs/send-reservation-reminders", "schedule": "*/15 * * * *" },
    { "path": "/api/jobs/mark-offline-devices", "schedule": "*/2 * * * *" }
  ]
}
```

All job routes are protected by a `CRON_SECRET` header check.

---

## License

Private - All rights reserved

## Support

For support, contact the development team.
