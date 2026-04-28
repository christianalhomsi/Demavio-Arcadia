# API Documentation

All endpoints are prefixed with `/api`. Authentication uses Supabase session cookies.

---

## Auth

### `POST /api/auth/signup`
Register a new player. Sends OTP to email.

**Request**
```json
{ "email": "user@example.com", "password": "secret123", "username": "player1" }
```
**Response `200`**
```json
{ "success": true }
```

---

### `POST /api/auth/request-otp`
Request OTP for login (existing users).

**Request**
```json
{ "email": "user@example.com" }
```
**Response `200`**
```json
{ "success": true }
```

---

### `POST /api/auth/verify-otp`
Verify OTP and receive a session token hash.

**Request**
```json
{ "email": "user@example.com", "otp": "123456" }
```
**Response `200`**
```json
{ "token_hash": "<hashed_token>" }
```
> Client exchanges `token_hash` via `/auth/callback?token_hash=...&type=magiclink` to establish a Supabase session.

---

## Reservations

### `POST /api/reservations`
Create a reservation. Staff can pass `guest_name` for walk-in guests.

**Auth:** Any authenticated user (staff required for `guest_name`)

**Request**
```json
{
  "hall_id": "uuid",
  "device_id": "uuid",
  "start_time": "2024-01-01T10:00:00Z",
  "end_time": "2024-01-01T12:00:00Z",
  "guest_name": "optional"
}
```
**Response `201`** — reservation object

| Status | Reason |
|--------|--------|
| `400` | Validation error |
| `401` | Not authenticated |
| `403` | Non-staff creating guest reservation |
| `404` | Device not found |
| `409` | Time slot overlap |
| `422` | Device paused or wrong hall |

---

## Sessions

### `POST /api/check-in`
Start a session from a reservation.

**Auth:** `hall_staff` or `hall_manager` assigned to the hall

**Request**
```json
{ "reservation_id": "uuid", "device_id": "uuid", "hall_id": "uuid" }
```
**Response `201`** — session object

---

### `POST /api/sessions/{id}/end`
End an active session and generate invoice.

**Auth:** `hall_staff` or `hall_manager` assigned to the hall

**Request**
```json
{
  "hall_id": "uuid",
  "rate_per_hour": 10.0,
  "payment_method": "cash | wallet | null",
  "wallet_price_per_hour": 8.0
}
```
**Response `200`**
```json
{
  "session_id": "uuid",
  "duration_hours": 1.5,
  "session_price": 15.0,
  "items_total": 5.0,
  "total_price": 20.0,
  "payment_id": "uuid | null",
  "ledger_id": "uuid | null",
  "is_paid": true
}
```

---

## Products

### `GET /api/products?hall_id={id}`
List all products for a hall.

**Auth:** Staff assigned to hall

### `POST /api/products?hall_id={id}`
Create a product.

**Request**
```json
{ "name": "Cola", "price": 2.5, "is_active": true }
```
**Response `201`** — product object

### `PATCH /api/products?product_id={id}`
Update a product (partial).

---

## Wallets

### `GET /api/wallets?hall_id={id}&username={u}` or `&guest_name={g}`
Get wallet balance.

**Response `200`**
```json
{ "id": "uuid", "balance": 50.0, "hall_id": "uuid", "user_id": "uuid | null" }
```

### `POST /api/wallets`
Top up a wallet.

**Auth:** Staff only

**Request**
```json
{ "hall_id": "uuid", "username": "player1", "amount": 50.0, "note": "optional" }
```
**Response `201`** — transaction object

---

## Agent

### `POST /api/agent/command`
Send a command to the local agent server.

**Auth:** Staff assigned to hall

**Request**
```json
{
  "command": "lock | unlock | restart | status",
  "device_id": "uuid",
  "hall_id": "uuid",
  "args": {}
}
```
**Response `200`** — agent result

| Status | Reason |
|--------|--------|
| `502` | Agent unreachable or error |

---

## Admin (`super_admin` only)

### `GET /api/admin/users?page=1&perPage=50`
List all users with roles.

**Response `200`**
```json
{
  "users": [{ "id": "uuid", "email": "...", "role": "player", "created_at": "..." }],
  "total": 100,
  "page": 1,
  "perPage": 50
}
```

### `POST /api/admin/users/invite`
Create a new user account.

**Request**
```json
{ "email": "staff@example.com", "password": "secret123" }
```
**Response `201`**
```json
{ "user_id": "uuid", "email": "staff@example.com" }
```

| Status | Reason |
|--------|--------|
| `400` | Validation error |
| `500` | Supabase user creation failed |

---

### `POST /api/admin/halls/bootstrap`
Create a hall with devices, manager, and optional staff in one call.

**Request**
```json
{
  "name": "Hall One",
  "address": "optional",
  "devices": [{ "device_type_id": "uuid", "quantity": 5, "price_per_hour": 10 }],
  "staff": { "email": "manager@example.com", "password": "secret" },
  "extra_staff": [{ "email": "staff@example.com", "password": "secret" }]
}
```
**Response `201`**
```json
{ "hall_id": "uuid" }
```

### `PATCH /api/admin/halls/{hallId}`
Update hall name, address, devices, or working hours.

**Request**
```json
{
  "name": "Updated Name",
  "address": "New Address",
  "devices": [{ "device_type_id": "uuid", "quantity": 3, "price_per_hour": 12 }],
  "devices_to_delete": ["uuid"],
  "working_hours": [{ "day": 0, "open_time": "09:00", "close_time": "22:00", "is_open": true }]
}
```
**Response `200`**
```json
{ "ok": true }
```

---

### `POST /api/admin/staff-assignments`
Assign an existing user to a hall with a role.

**Request**
```json
{ "hall_id": "uuid", "email": "user@example.com", "role": "hall_manager | hall_staff" }
```
**Response `201`**
```json
{ "ok": true }
```

| Status | Reason |
|--------|--------|
| `404` | No auth user found for that email |
| `500` | DB insert failed |

---

## Cron Jobs

All job routes require: `Authorization: Bearer <CRON_SECRET>`

| Route | Action |
|-------|--------|
| `POST /api/jobs/cancel-expired-reservations` | Cancel reservations past end time |
| `POST /api/jobs/process-reservation-statuses` | Update reservation statuses |
| `POST /api/jobs/send-reservation-reminders` | Email reminders before sessions |
| `POST /api/jobs/mark-offline-devices` | Mark devices offline if agent silent |
