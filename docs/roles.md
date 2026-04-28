# Roles & Permissions

## Role Definitions

| Role | Description |
|------|-------------|
| `super_admin` | Full access to everything — all halls, all users, admin panel |
| `hall_manager` | Manages one assigned hall: devices, staff, reservations, sessions, reports |
| `hall_staff` | Operates one assigned hall: check-in, sessions, products, wallets |
| `player` | Books reservations, manages their own wallet |

---

## Permissions Matrix

| Action | `super_admin` | `hall_manager` | `hall_staff` | `player` |
|--------|:---:|:---:|:---:|:---:|
| View all halls | ✅ | ❌ | ❌ | ❌ |
| Create/delete halls | ✅ | ❌ | ❌ | ❌ |
| Invite users | ✅ | ❌ | ❌ | ❌ |
| Assign staff to halls | ✅ | ❌ | ❌ | ❌ |
| View hall dashboard | ✅ | ✅ | ✅ | ❌ |
| Manage devices | ✅ | ✅ | ❌ | ❌ |
| Manage products | ✅ | ✅ | ✅ | ❌ |
| Check-in reservations | ✅ | ✅ | ✅ | ❌ |
| Start/end sessions | ✅ | ✅ | ✅ | ❌ |
| Create guest reservations | ✅ | ✅ | ✅ | ❌ |
| Top up wallets | ✅ | ✅ | ✅ | ❌ |
| Open/close cash register | ✅ | ✅ | ✅ | ❌ |
| Send agent commands | ✅ | ✅ | ✅ | ❌ |
| Create own reservations | ✅ | ✅ | ✅ | ✅ |
| View own wallet | ✅ | ✅ | ✅ | ✅ |

---

## `staff_assignments` Table

This table links `hall_manager` and `hall_staff` users to their assigned hall. A user can only be assigned to **one hall**.

```
staff_assignments
├── user_id  → profiles.id
└── hall_id  → halls.id
```

**How it's used:**
- On login, middleware queries `staff_assignments` to redirect staff to their hall dashboard (`/dashboard/{hall_id}`)
- Every staff API route calls `verifyStaffHallAccess(userId, hallId)` which checks this table
- `super_admin` bypasses this check entirely

**Assigning staff** is done via `POST /api/admin/staff-assignments` (super_admin only):
```json
{ "user_id": "uuid", "hall_id": "uuid" }
```

---

## Auth Redirect Logic

After login, users are redirected based on role:

```
hall_manager / hall_staff  →  /dashboard/{hall_id}   (from staff_assignments)
super_admin / player       →  /halls
```

If a `hall_manager` or `hall_staff` has no `staff_assignments` row, they land on `/halls` with no accessible halls.
