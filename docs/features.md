# Features

## Reservation System

### Statuses
```
pending → confirmed → active → completed
                    ↘ cancelled
```

| Status | Meaning |
|--------|---------|
| `pending` | Player booked — awaiting confirmation |
| `confirmed` | Staff/guest booking — ready for check-in |
| `active` | Session started (check-in done) |
| `completed` | Session ended or time passed |
| `cancelled` | Cancelled before check-in |

### Flow

**Player booking:**
1. Player calls `POST /api/reservations` → status: `pending` (awaiting staff confirmation or payment)
2. `pending` → `confirmed`: must be explicitly confirmed by staff (or via payment webhook if applicable) — the cron job does **not** auto-confirm pending reservations
3. `confirmed` → `active`: handled automatically by the cron job `process-reservation-statuses` when `start_time` is reached, **or** manually by staff calling `POST /api/check-in` (whichever happens first — both are idempotent; check-in sets status to `active` and creates a session, cron skips rows already `active`)
4. `POST /api/check-in` — staff scans/selects the reservation, creates a session, and sets device + reservation status to `active`

**Staff/guest booking:**
1. Staff calls `POST /api/reservations` with `guest_name` → status: `confirmed` (skips pending)
2. Staff checks in at arrival → `POST /api/check-in`

**Overlap prevention:** PostgreSQL exclusion constraint on `(device_id, tstzrange(start_time, end_time))` — no two active reservations can overlap on the same device.

**Cron jobs involved:**
- `process-reservation-statuses` (every 1 min) — `confirmed` → `active` → `completed`
- `cancel-expired-reservations` (every 5 min) — cancels `confirmed` reservations past `end_time` with no check-in
- `send-reservation-reminders` (every 15 min) — emails players before their session starts

---

## Wallet System

Each player or guest has a wallet **per hall** (balances don't transfer between halls).

### Tables
```
player_wallets          — one wallet per (user/guest + hall)
wallet_transactions     — every top-up and deduction
```

### Balance Calculation
Balance is computed via a Supabase RPC function `get_wallet_balance(wallet_uuid)`:
```sql
SUM(amount) WHERE type = 'top_up'  -  SUM(amount) WHERE type = 'deduction'
```
No balance column is stored — it's always calculated from transactions (audit-safe).

### Transaction Types
| Type | When |
|------|------|
| `top_up` | Staff adds credit via `POST /api/wallets` |
| `deduction` | Session ended with `payment_method: "wallet"` |

### Wallet Payment Flow
1. Staff ends session with `payment_method: "wallet"`
2. System calls `getOrCreateWallet(hall_id, user_id, guest_name)`
3. Checks balance via `get_wallet_balance` — returns `400` if insufficient
4. Inserts `deduction` transaction
5. Invoice created with `payment_method: "wallet"`

---

## Invoice System

An invoice is **always created** when a session ends, whether paid or not.

### Invoice Fields
| Field | Description |
|-------|-------------|
| `session_price` | Base cost: `duration_hours × effective_rate`. When `payment_method = 'wallet'`, `effective_rate = wallet_price_per_hour`; otherwise `effective_rate = rate_per_hour`. Both rates are passed at session-end time. |
| `rate_per_hour` | The rate used for the invoice (stores `wallet_price_per_hour` when wallet payment) |
| `items_total` | Sum of all `session_items` consumed |
| `total_price` | `session_price + items_total` |
| `payment_method` | `cash`, `wallet`, or `null` (unpaid) |
| `is_paid` | `true` if payment_method was provided |

### When invoices are created
- `POST /api/sessions/{id}/end` always inserts an invoice row
- Unpaid sessions get `is_paid: false`, `payment_method: null`
- Staff can collect payment later (unpaid invoices support)

### Wallet rate
If `payment_method = "wallet"`, the system uses `wallet_price_per_hour` instead of `rate_per_hour` (discounted wallet rate).

---

## Cash Register

One cash register can be open per hall at a time.

### Workflow
```
Open register (opening_balance) 
    → sessions run, cash collected 
    → Close register (actual_balance)
    → System calculates variance
```

### Close Calculation
```
expected_balance = opening_balance + total_income - total_outflows
variance         = actual_balance - expected_balance
```

A positive variance means more cash than expected. Negative means a shortage.

### Statuses
| Status | Meaning |
|--------|---------|
| `open` | Register is active, shift in progress |
| `closed` | Shift ended, variance recorded |
