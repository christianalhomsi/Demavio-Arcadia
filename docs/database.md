# Database Setup

## Prerequisites

- Supabase project created
- SQL Editor access in Supabase Dashboard
- **`btree_gist` extension** — required for the `EXCLUDE USING gist` constraint on `reservations`. Enable it before running migrations:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

---

## Migration Order

Run the SQL files in this exact order from the `supabase/` directory:

```
1.  device_types_migration.sql          — adds device_types table
2.  add_price_per_hour_migration.sql    — adds price_per_hour to hall_devices
3.  add_paused_status_migration.sql     — adds 'paused' status to devices
4.  add_username_migration.sql          — adds username to profiles
5.  add_username_to_otp_migration.sql   — adds username to otp_codes
6.  add_guest_name_to_reservations.sql  — adds guest_name to reservations
7.  fix_reservations_user_id.sql        — makes user_id nullable for guests
8.  add_products_and_session_items.sql  — adds products + session_items tables
9.  add_invoices_table.sql              — adds invoices table
10. add_unpaid_invoices_support.sql     — adds is_paid flag to invoices
11. add_player_wallets.sql              — adds wallets + wallet transactions
```

---

## Core Tables (Bootstrap)

If starting from scratch, run this first to create all base tables:

```sql
-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  username   TEXT UNIQUE,
  role       TEXT NOT NULL DEFAULT 'player',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Halls
CREATE TABLE halls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  owner_id    UUID REFERENCES profiles(id),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Device types per hall
CREATE TABLE device_types (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  name    TEXT NOT NULL
);

-- Devices
CREATE TABLE hall_devices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id        UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  type_id        UUID REFERENCES device_types(id),
  status         TEXT NOT NULL DEFAULT 'available',
  price_per_hour NUMERIC(10,2) DEFAULT 0,
  last_ping      TIMESTAMPTZ
);

-- Staff assignments
CREATE TABLE staff_assignments (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hall_id UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, hall_id)
);

-- OTP codes
CREATE TABLE otp_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  username      TEXT,
  otp_hash      TEXT NOT NULL,
  password_hash TEXT,
  attempts      INT DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL,
  used          BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Reservations
CREATE TABLE reservations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id    UUID NOT NULL REFERENCES halls(id),
  device_id  UUID NOT NULL REFERENCES hall_devices(id),
  user_id    UUID REFERENCES profiles(id),
  guest_name TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time   TIMESTAMPTZ NOT NULL,
  status     TEXT NOT NULL DEFAULT 'upcoming',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- At least one identifier must be present
  CONSTRAINT chk_reservation_identity CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL),
  -- Prevent overlapping reservations on same device (requires btree_gist extension)
  EXCLUDE USING gist (
    device_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status NOT IN ('cancelled', 'completed'))
);

-- Sessions
CREATE TABLE sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID REFERENCES reservations(id),
  device_id      UUID NOT NULL REFERENCES hall_devices(id),
  hall_id        UUID NOT NULL REFERENCES halls(id),
  user_id        UUID REFERENCES profiles(id),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at       TIMESTAMPTZ,
  total_price    NUMERIC(10,2)
);

-- Products
CREATE TABLE products (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id    UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  price      NUMERIC(10,2) NOT NULL,
  stock      INT DEFAULT 0,
  is_active  BOOLEAN DEFAULT TRUE
);

-- Session items
CREATE TABLE session_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity   INT NOT NULL DEFAULT 1,
  price      NUMERIC(10,2) NOT NULL
);

-- Wallets
CREATE TABLE wallets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES profiles(id),
  guest_name TEXT,
  hall_id    UUID NOT NULL REFERENCES halls(id),
  balance    NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- At least one identifier must be present
  CONSTRAINT chk_wallet_identity CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL),
  -- Prevent duplicate wallets per hall
  CONSTRAINT uq_wallet_user_hall  UNIQUE (user_id, hall_id),
  CONSTRAINT uq_wallet_guest_hall UNIQUE (guest_name, hall_id)
);

-- Transactions
CREATE TABLE transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id      UUID NOT NULL REFERENCES halls(id),
  user_id      UUID REFERENCES profiles(id),
  amount       NUMERIC(10,2) NOT NULL,
  type         TEXT NOT NULL,
  reference_id UUID,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Cash registers
CREATE TABLE cash_registers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id         UUID NOT NULL REFERENCES halls(id),
  opened_by       UUID NOT NULL REFERENCES profiles(id),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- Invoices
CREATE TABLE invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES sessions(id),
  payment_id            UUID,
  hall_id               UUID NOT NULL REFERENCES halls(id),
  device_id             UUID REFERENCES hall_devices(id),
  user_id               UUID REFERENCES profiles(id),
  started_at            TIMESTAMPTZ,
  ended_at              TIMESTAMPTZ,
  duration_hours        NUMERIC(10,4),
  rate_per_hour         NUMERIC(10,2),
  session_price         NUMERIC(10,2),
  items                 JSONB DEFAULT '[]',
  items_total           NUMERIC(10,2) DEFAULT 0,
  total_price           NUMERIC(10,2) NOT NULL,
  payment_method        TEXT,
  wallet_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  is_paid               BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES profiles(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Working hours
CREATE TABLE working_hours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id     UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time   TIME NOT NULL,
  close_time  TIME NOT NULL,
  UNIQUE (hall_id, day_of_week),
  CHECK (close_time > open_time)
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## After Running Migrations

Apply RLS policies — see [security.md](./security.md).
