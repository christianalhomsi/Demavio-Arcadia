# Arcadia — Use Cases & Flow Documentation

---

## 1. Authentication Module

### UC-01: Login via OTP
**Actors:** Any user (Player, Staff, Manager, Super Admin)  
**Flow:**
```
1. User enters email on /auth/login
2. POST /api/auth/request-otp
   → generateOtp() → hashOtp(otp, OTP_SECRET)
   → store hash in otp_codes table
   → sendOtpEmail(email, otp) via Gmail SMTP
3. User enters 6-digit OTP on /auth/verify-otp
4. POST /api/auth/verify-otp
   → getLatestOtpRequest(email)
   → verifyOtp(input, hash, OTP_SECRET)
   → markOtpVerified(record.id)
   → admin.auth.admin.generateLink({ type: "magiclink", email })
   → return { token_hash }
5. Client redirects to /auth/callback?token_hash=...
6. Supabase exchanges token → sets session cookies
7. Middleware reads role from profiles table:
   - hall_manager / hall_staff → /dashboard/{hall_id}
   - super_admin / player      → /halls
```

### UC-02: Sign Up (New Player)
**Actors:** New user  
**Flow:**
```
1. User fills signup form (email, username, password)
2. POST /api/auth/signup
   → encrypt password with OTP_SECRET
   → store in otp_codes with password_hash + username
   → send OTP email
3. User verifies OTP → POST /api/auth/verify-otp
   → decryptPassword(record.password_hash)
   → admin.auth.admin.createUser({ email, password })
   → profiles.update({ role: "player", username })
   → generateLink → return token_hash
4. Client → /auth/callback → session created
```

### UC-03: Set Username (First Login)
**Actors:** Authenticated user without username  
**Flow:**
```
1. Middleware detects missing username → redirect /auth/set-username
2. User submits username
3. profiles.update({ username }) for current user
4. Redirect to appropriate dashboard
```

---

## 2. Super Admin Module

### UC-04: Create Hall (Bootstrap)
**Actors:** Super Admin  
**Flow:**
```
1. Admin fills form on /admin/halls/new
2. POST /api/admin/halls/bootstrap
   → assertSuperAdmin() guard
   → INSERT halls (name, address, working_hours)
   → For each device group:
       INSERT devices (hall_id, name, status="available", device_type_id) × quantity
       INSERT hall_devices (hall_id, device_type_id, quantity, price_per_hour)
   → If staff provided:
       admin.auth.admin.createUser(email, password)
       INSERT profiles (role="hall_manager")
       INSERT staff_assignments (user_id, hall_id, role="hall_manager")
       INSERT staff_hall_access (legacy)
   → If extra_staff provided: repeat above with role="hall_staff"
   → On any failure: rollbackHall() deletes all created records
   → return { hall_id }
```

### UC-05: Edit Hall
**Actors:** Super Admin  
**Flow:**
```
1. Admin opens /admin/halls/[hallId]
2. PATCH /api/admin/halls/[hallId]
   → assertSuperAdmin()
   → UPDATE halls SET name, address, working_hours
```

### UC-06: Manage Users
**Actors:** Super Admin  
**Flow:**
```
1. Admin opens /admin/users
2. GET /api/admin/users?page=1&perPage=50
   → assertSuperAdmin()
   → admin.auth.admin.listUsers()
   → JOIN profiles to get roles
   → return users list with roles
3. Admin can invite new user:
   POST /api/admin/users/invite
   → create user + assign role + staff_assignment
4. Admin can update user role:
   PATCH /api/users/[userId]
   → UPDATE profiles SET role
```

### UC-07: View All Reservations (Admin)
**Actors:** Super Admin  
**Flow:**
```
1. GET /api/admin/reservations
   → assertSuperAdmin()
   → SELECT reservations with device + hall + user joins
   → return paginated list
```

### UC-08: Manage Staff Assignments
**Actors:** Super Admin  
**Flow:**
```
1. POST /api/admin/staff-assignments
   → assertSuperAdmin()
   → INSERT staff_assignments (user_id, hall_id, role)
```

---

## 3. Hall Dashboard Module

### UC-09: View Dashboard Overview
**Actors:** Hall Manager, Hall Staff  
**Flow:**
```
1. User navigates to /dashboard/[hallId]/overview
2. GET /api/dashboard/[hallId]
   → verifyHallManagementAccess(user.id, hallId)
   → Fetch: active sessions count, available devices, today's revenue,
            pending reservations, recent transactions
3. Render stats cards + device status grid
```

### UC-10: View Devices Grid
**Actors:** Hall Manager, Hall Staff  
**Flow:**
```
1. User opens /dashboard/[hallId]/devices
2. Page fetches devices for hall with status + active session info
3. Each device card shows: name, type, status, current session timer
4. Staff can: Check-in, Pause/Resume, End Session from device card
```

---

## 4. Reservation Module

### UC-11: Create Reservation (Player)
**Actors:** Authenticated Player  
**Flow:**
```
1. Player opens /reservations/new
2. Selects hall → device → date/time slot
3. POST /api/reservations
   → Validate end_time > start_time
   → getDevice(device_id) → verify hall ownership
   → Check device not paused
   → createReservation(input, user.id)
      → status = "pending" (player bookings)
      → INSERT reservations
      → DB exclusion constraint prevents time overlap → returns OVERLAP error
4. On success → reservation created with status "pending"
5. Cron job (process-reservation-statuses) transitions: pending → confirmed → active → completed
```

### UC-12: Create Guest Reservation (Staff)
**Actors:** Hall Staff, Hall Manager  
**Flow:**
```
1. Staff opens /dashboard/[hallId]/reservations
2. Fills guest_name + device + time slot
3. POST /api/reservations { guest_name, ... }
   → verifyHallManagementAccess(user.id, hall_id) — required for guest bookings
   → createReservation(input, userId=null)
      → status = "confirmed" (guest bookings skip pending)
4. Reservation ready for immediate check-in
```

### UC-13: Check-In (Start Session)
**Actors:** Hall Staff, Hall Manager  
**Flow:**
```
1. Staff clicks "Check-In" on device card
2. POST /api/check-in { reservation_id, device_id, hall_id }
   → verifyStaffHallAccess(user.id, hall_id)
   → getReservation(reservation_id) → verify device match
   → Verify reservation.status === "confirmed"
   → Check no existing active session on device (unique partial index guard)
   → createSession(reservation_id, device_id, user_id, hall_id)
      → INSERT sessions (started_at = now)
      → INSERT invoices (is_paid=false, totals=0) — invoice created immediately
   → setDeviceActive(device_id) → status = "active"
   → setReservationActive(reservation_id) → status = "active"
3. Return session object → device card updates to active state
```

### UC-14: Cancel / Manage Reservation
**Actors:** Hall Staff, Hall Manager  
**Flow:**
```
1. Staff opens /dashboard/[hallId]/reservations
2. Reservation actions: confirm, cancel
3. PATCH /api/admin/reservations or direct Supabase update
   → UPDATE reservations SET status = "cancelled" / "confirmed"
```

---

## 5. Session Module

### UC-15: End Session & Collect Payment
**Actors:** Hall Staff, Hall Manager  
**Flow:**
```
1. Staff clicks "End Session" on active device card
2. Session modal opens showing: duration, items, calculated total
3. Staff selects payment method: cash | wallet
4. POST /api/sessions/[id]/end { hall_id, rate_per_hour, payment_method, wallet_price_per_hour }
   → verifyStaffHallAccess(user.id, hall_id)
   → getActiveSession(id) → verify session.hall_id === hall_id
   → calculateDuration(started_at, now) → durationHours
   → effectiveRate = wallet_price_per_hour (if wallet) else rate_per_hour
   → sessionPrice = durationHours × effectiveRate
   → calculateSessionTotal(session.id) → itemsTotal
   → totalPrice = sessionPrice + itemsTotal

   If payment_method === "wallet":
     → getOrCreateWallet(hall_id, user_id | guest_name)
     → deductFromWallet(wallet.id, totalPrice, session.id)
       → check balance ≥ totalPrice else return 400
       → INSERT wallet_transactions (type="deduction")

   → createPayment(session.id, user_id, totalPrice, durationHours)
   → createLedgerEntry(payment.id, totalPrice)
   → endSession(session.id, endedAt) → UPDATE sessions SET ended_at
   → setDeviceAvailable(device_id) → status = "available"
   → UPDATE invoices SET ended_at, duration_hours, rate_per_hour,
                         session_price, items, items_total, total_price,
                         payment_method, is_paid=true
   → revalidatePath for overview pages
5. Return summary: { session_id, duration_hours, session_price, items_total, total_price }
```

### UC-16: Pause / Resume Device
**Actors:** Hall Staff, Hall Manager  
**Flow:**
```
1. Staff clicks "Pause" on device card
2. POST /api/devices/pause { device_id, hall_id, paused: true }
   → verifyStaffHallAccess(user.id, hall_id)
   → Verify device belongs to hall
   → If paused=true  → status = "paused"
   → If paused=false → check active session → "active"
                     → check confirmed reservation → "idle"
                     → else → "available"
   → UPDATE devices SET status (via admin client, bypasses RLS)
   → writeAuditLog(action="update", entity="device")
```

---

## 6. Session Items (Products During Session)

### UC-17: Add Product to Active Session
**Actors:** Hall Staff, Hall Manager  
**Flow:**
```
1. Staff opens session modal → clicks "Add Item"
2. POST /api/session-items { session_id, product_id, product_name, product_price, quantity }
   → verifyStaffHallAccess via session → device → hall chain
   → addSessionItem(data) → INSERT session_items
3. Session total recalculates automatically
```

### UC-18: Remove Session Item
**Actors:** Hall Staff, Hall Manager  
**Flow:**
```
1. Staff clicks remove on item in session modal
2. DELETE /api/session-items?item_id=xxx
   → Verify item → session → device → hall access chain
   → removeSessionItem(itemId) → DELETE session_items
```

---

## 7. Products Module

### UC-19: Manage Hall Products
**Actors:** Hall Manager, Hall Staff  
**Flow:**
```
GET  /api/products?hall_id=xxx         → list all products
POST /api/products?hall_id=xxx         → create product { name, price, is_active }
PATCH /api/products?product_id=xxx     → update product fields
                                         (toggle active/inactive via is_active)

All mutations:
  → verifyStaffHallAccess(user.id, hall_id)
  → INSERT / UPDATE products table
```

---

## 8. Wallet Module

### UC-20: Top-Up Player Wallet
**Actors:** Hall Staff, Hall Manager  
**Flow:**
```
1. Staff opens /dashboard/[hallId]/wallets
2. Searches player by username or guest_name
3. GET /api/wallets?hall_id=xxx&username=yyy
   → Lookup profile by username → get user_id
   → getOrCreateWallet(hall_id, user_id, null)
   → getWalletBalance(wallet.id) via RPC get_wallet_balance
   → return wallet + balance
4. Staff enters top-up amount
5. POST /api/wallets { hall_id, username, amount, note }
   → verifyAuthenticated
   → getOrCreateWallet → addWalletTopUp
   → INSERT wallet_transactions (type="top_up", added_by=staff.id)
```

### UC-21: Pay Session via Wallet
**Actors:** Hall Staff (during end session)  
**Flow:**
```
→ Covered in UC-15 (payment_method === "wallet")
→ deductFromWallet checks balance first
→ INSERT wallet_transactions (type="deduction", session_id)
```

---

## 9. Finance Module

### UC-22: Cash Register — Open
**Actors:** Hall Manager, Hall Staff  
**Flow:**
```
1. Staff opens /dashboard/[hallId]/finance/register
2. Fills opening_balance
3. POST via open-register-form action
   → openCashRegister({ hall_id, opened_by, opening_balance })
   → INSERT cash_registers (status="open", opened_at=now)
```

### UC-23: Cash Register — Close
**Actors:** Hall Manager, Hall Staff  
**Flow:**
```
1. Staff fills actual_balance at end of shift
2. closeCashRegister({ register_id, actual_balance, total_income, total_outflows, closed_by })
   → getCashRegister(register_id) → verify status="open"
   → calculateExpectedBalance(opening + income - outflows)
   → calculateVariance(actual - expected)
   → UPDATE cash_registers SET status="closed", closed_at, actual_balance,
                               expected_balance, variance
3. Summary shown: expected vs actual, variance
```

### UC-24: View Transactions
**Actors:** Hall Manager  
**Flow:**
```
1. Manager opens /dashboard/[hallId]/finance/transactions
2. Fetch transactions for hall ordered by created_at DESC
3. Table shows: type, amount, user, reference, date
```

### UC-25: View & Pay Invoices
**Actors:** Hall Staff, Hall Manager  
**Flow:**
```
1. Staff opens /dashboard/[hallId]/finance/invoices
2. List shows unpaid invoices (is_paid=false)
3. Staff clicks "Pay" on an invoice
4. POST /api/invoices/[id]/pay { payment_method }
   → verifyStaffHallAccess(user.id, invoice.hall_id)
   → Check invoice.is_paid === false
   → createPayment(session_id, user_id, total_price, duration_hours)
   → createLedgerEntry(payment.id, total_price)
   → UPDATE invoices SET is_paid=true, payment_id, payment_method
     WHERE id=invoiceId AND is_paid=false  ← atomic, prevents double-payment
```

### UC-26: View Audit Logs
**Actors:** Hall Manager, Super Admin  
**Flow:**
```
1. Manager opens /dashboard/[hallId]/finance/audit-logs
2. Fetch audit_logs for hall filtered by actor/action/date
3. Shows: actor, action, entity_type, entity_id, old_data, new_data, timestamp
```

---

## 10. Settings Module

### UC-27: Configure Device Pricing
**Actors:** Hall Manager  
**Flow:**
```
1. Manager opens /dashboard/[hallId]/settings → Pricing tab
2. pricing-editor.tsx lists device types with current price_per_hour
3. PATCH /api/devices/[deviceId]/price { price_per_hour }
   → UPDATE hall_devices SET price_per_hour
```

### UC-28: Manage Staff
**Actors:** Hall Manager  
**Flow:**
```
1. Manager opens /dashboard/[hallId]/settings → Staff tab
2. staff-section.tsx shows assigned staff
3. Add staff: POST /api/admin/staff-assignments { user_id, hall_id, role }
4. Remove staff: DELETE staff_assignments WHERE user_id + hall_id
```

### UC-29: Configure Working Hours
**Actors:** Hall Manager  
**Flow:**
```
1. Manager opens /dashboard/[hallId]/settings → Working Hours tab
2. working-hours-editor.tsx shows 7-day schedule
3. PATCH /api/halls/[hallId]/working-hours
   → UPDATE halls SET working_hours (JSONB)
```

### UC-30: Manage Products (Settings)
**Actors:** Hall Manager  
**Flow:**
```
→ Same as UC-19 but accessed from settings page
→ products-section.tsx wraps product CRUD
```

---

## 11. Agent System

### UC-31: Send Remote Device Command
**Actors:** Hall Staff, Hall Manager  
**Flow:**
```
1. Staff opens /dashboard/[hallId]/agent
2. agent-panel.tsx sends command (lock, unlock, restart, etc.)
3. POST /api/agent/command { command, device_id, hall_id, args }
   → verifyStaffHallAccess(user.id, hall_id)
   → getDevice(device_id) → verify hall ownership
   → sendAgentCommand(payload)
      → POST {AGENT_URL}/command
         Headers: Authorization: Bearer {AGENT_SECRET}
      → Agent server executes command on physical device
   → writeAuditLog(action="update", entity="device", new_data={ command })
4. Return agent response to UI
```

---

## 12. Cron Jobs

### UC-32: Cancel Expired Reservations
**Trigger:** Every 5 minutes — `GET /api/jobs/cancel-expired-reservations`
```
→ CRON_SECRET header check
→ cancelExpiredReservations()
   → UPDATE reservations SET status="cancelled"
      WHERE status IN ("pending","confirmed") AND end_time < now
```

### UC-33: Process Reservation Statuses
**Trigger:** Every 1 minute — `GET /api/jobs/process-reservation-statuses`
```
→ processReservationStatuses()
   → UPDATE reservations SET status="completed"
      WHERE status="active" AND end_time ≤ now
   Note: auto-activation is disabled — staff must manually check-in
```

### UC-34: Send Reservation Reminders
**Trigger:** Every 15 minutes — `GET /api/jobs/send-reservation-reminders`
```
→ sendReservationReminders(windowMinutes=60)
   → SELECT confirmed reservations WHERE start_time BETWEEN now AND now+60min
                                    AND reminder_sent_at IS NULL
   → For each: sendReservationReminder(user_id, reservation_id, start_time)
   → UPDATE reservations SET reminder_sent_at=now WHERE reminder_sent_at IS NULL
     (conditional update prevents race condition on concurrent runs)
```

### UC-35: Mark Offline Devices
**Trigger:** Every 2 minutes — `GET /api/jobs/mark-offline-devices`
```
→ markOfflineDevices(timeoutMinutes=5)
   → UPDATE hall_devices SET status="offline"
      WHERE status != "offline" AND last_ping < now-5min
```

---

## Role × Use Case Matrix

| Use Case | super_admin | hall_manager | hall_staff | player |
|----------|:-----------:|:------------:|:----------:|:------:|
| UC-01 Login | ✅ | ✅ | ✅ | ✅ |
| UC-02 Sign Up | ✅ | ✅ | ✅ | ✅ |
| UC-04 Create Hall | ✅ | ❌ | ❌ | ❌ |
| UC-05 Edit Hall | ✅ | ❌ | ❌ | ❌ |
| UC-06 Manage Users | ✅ | ❌ | ❌ | ❌ |
| UC-09 Dashboard Overview | ✅ | ✅ | ✅ | ❌ |
| UC-11 Create Reservation | ✅ | ✅ | ✅ | ✅ |
| UC-12 Guest Reservation | ✅ | ✅ | ✅ | ❌ |
| UC-13 Check-In | ✅ | ✅ | ✅ | ❌ |
| UC-15 End Session | ✅ | ✅ | ✅ | ❌ |
| UC-16 Pause Device | ✅ | ✅ | ✅ | ❌ |
| UC-17 Add Session Item | ✅ | ✅ | ✅ | ❌ |
| UC-19 Manage Products | ✅ | ✅ | ✅ | ❌ |
| UC-20 Top-Up Wallet | ✅ | ✅ | ✅ | ❌ |
| UC-22 Open Register | ✅ | ✅ | ✅ | ❌ |
| UC-23 Close Register | ✅ | ✅ | ✅ | ❌ |
| UC-25 Pay Invoice | ✅ | ✅ | ✅ | ❌ |
| UC-26 Audit Logs | ✅ | ✅ | ❌ | ❌ |
| UC-27 Configure Pricing | ✅ | ✅ | ❌ | ❌ |
| UC-28 Manage Staff | ✅ | ✅ | ❌ | ❌ |
| UC-29 Working Hours | ✅ | ✅ | ❌ | ❌ |
| UC-31 Agent Commands | ✅ | ✅ | ✅ | ❌ |

---

## Key State Machines

### Reservation Status
```
pending ──(cron / staff confirm)──► confirmed ──(check-in)──► active ──(cron)──► completed
   │                                    │
   └──(cron: end_time passed)──► cancelled ◄──(staff cancel)──┘
```

### Device Status
```
available ──(check-in)──► active ──(end session)──► available
    │                                                    │
    └──(pause)──► paused ──(resume)──────────────────────┘
    │
    └──(confirmed reservation exists)──► idle
    │
    └──(agent heartbeat timeout)──► offline
```

### Session / Invoice Lifecycle
```
[check-in]
  → sessions INSERT (ended_at=NULL)
  → invoices INSERT (is_paid=false, totals=0)

[add items during session]
  → session_items INSERT

[end session]
  → sessions UPDATE (ended_at=now)
  → invoices UPDATE (all totals, is_paid=true if paid immediately)
  → payments INSERT + ledger INSERT (if paid)
  → devices UPDATE (status=available)

[pay unpaid invoice later]
  → invoices UPDATE (is_paid=true) WHERE is_paid=false  ← atomic
  → payments INSERT + ledger INSERT
```
