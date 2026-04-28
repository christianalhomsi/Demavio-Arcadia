# Deployment

## Vercel

### 1. Deploy

```bash
npm i -g vercel
vercel --prod
```

Or connect your GitHub repo in the Vercel dashboard for automatic deploys.

### 2. Environment Variables

In Vercel → Project → Settings → Environment Variables, add all variables from `.env.example`:

| Variable | Where to get it |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (service_role key) |
| `OTP_SECRET` | Run: `openssl rand -hex 32` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | Your Gmail address |
| `SMTP_PASSWORD` | Gmail App Password (16 chars) |
| `SMTP_FROM_EMAIL` | Your Gmail address |
| `SMTP_FROM_NAME` | `Arcadia` |
| `AGENT_SERVER_URL` | URL of the agent server (e.g. ngrok URL) |
| `AGENT_SERVER_SECRET` | Any strong random string |
| `CRON_SECRET` | Run: `openssl rand -hex 32` |
| `NEXT_PUBLIC_SESSION_TIMEOUT` | `10800` (3 hours in seconds) |

### 3. Supabase Auth Redirect URL

In Supabase → Authentication → URL Configuration:
- **Site URL:** `https://your-app.vercel.app`
- **Redirect URLs:** `https://your-app.vercel.app/ar/auth/callback, https://your-app.vercel.app/en/auth/callback`

---

## Cron Jobs (Vercel Cron)

Create `vercel.json` in the project root:

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

Vercel automatically sends requests to these routes on schedule. Each route checks:
```
Authorization: Bearer <CRON_SECRET>
```

> Vercel Cron is available on Pro plan. For free tier, use [cron-job.org](https://cron-job.org) with the same routes and header.

### cron-job.org Setup (free alternative)
1. Create account at cron-job.org
2. Add a new cron job for each route
3. Set URL: `https://your-app.vercel.app/api/jobs/<job-name>`
4. Add header: `Authorization: Bearer <your-CRON_SECRET>`
5. Set schedule matching the table above

---

## Agent Server

The agent is a **separate local server** running on each hall's machine. It receives commands from the Next.js backend to control devices.

### Requirements
- Node.js 18+ on the hall machine
- Network access from Vercel to the agent (use ngrok or a static IP)

### Setup

1. Create a simple Express server on the hall machine:

```ts
// agent-server.ts
import express from "express";

const app = express();
app.use(express.json());

const SECRET = process.env.AGENT_SERVER_SECRET;

app.post("/command", (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { command, device_id, args } = req.body;

  // Log command without sensitive args
  console.debug(`[agent] command=${command} device=${device_id.slice(0, 8)}...`);

  // Implement: lock, unlock, restart, shutdown, screenshot, message
  res.json({ accepted: true, device_id, command });
});

app.listen(4000, () => console.log("Agent running on :4000"));
```

2. Expose the agent server publicly using ngrok:

```bash
ngrok http 4000
```

3. Set in Vercel environment variables:
```
AGENT_SERVER_URL=https://xxxx.ngrok.io
AGENT_SERVER_SECRET=your-shared-secret
```

### Supported Commands

| Command | Action |
|---------|--------|
| `lock` | Lock the device screen |
| `unlock` | Unlock the device |
| `restart` | Restart the device |
| `shutdown` | Shut down the device |
| `screenshot` | Capture device screen |
| `message` | Display a message on screen |

### Device Ping (mark-offline-devices)

The agent should periodically ping the backend to mark itself as online:

```
POST /api/agent/ping
Authorization: Bearer <AGENT_SERVER_SECRET>
{ "device_id": "uuid", "hall_id": "uuid" }
```

The backend validates the `Authorization` header against `AGENT_SERVER_SECRET` before updating `last_ping`. The cron job `mark-offline-devices` (every 2 min) marks devices as `offline` if `last_ping` is older than a threshold.
