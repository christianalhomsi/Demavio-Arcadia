-- Player Wallets Feature Migration
-- Adds wallet system scoped per hall with transaction-based balance tracking

-- ============================================
-- 1. Player Wallets Table (Hall-scoped)
-- ============================================
CREATE TABLE IF NOT EXISTS player_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  guest_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Either user_id or guest_name must be present
  CONSTRAINT wallet_user_or_guest_check CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL),
  -- Unique wallet per player per hall
  CONSTRAINT unique_wallet_per_hall UNIQUE NULLS NOT DISTINCT (hall_id, user_id, guest_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_player_wallets_hall_id ON player_wallets(hall_id);
CREATE INDEX IF NOT EXISTS idx_player_wallets_user_id ON player_wallets(user_id);

-- ============================================
-- 2. Wallet Transactions Table
-- ============================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES player_wallets(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('top_up', 'deduction', 'refund')),
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_session_id ON wallet_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at DESC);

-- ============================================
-- 3. Add wallet price to hall_devices
-- ============================================
ALTER TABLE hall_devices 
ADD COLUMN IF NOT EXISTS wallet_price_per_hour DECIMAL(10, 2);

COMMENT ON COLUMN hall_devices.wallet_price_per_hour IS 'Optional discounted price when paying with wallet. Falls back to price_per_hour if null';

-- ============================================
-- 4. Add payment method to invoices
-- ============================================
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'wallet'));

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS wallet_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL;

-- ============================================
-- 5. RLS Policies
-- ============================================

-- Player Wallets: Enable RLS
ALTER TABLE player_wallets ENABLE ROW LEVEL SECURITY;

-- Super admins can manage all wallets
CREATE POLICY "Super admins can manage all wallets"
ON player_wallets
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

-- Staff can manage wallets for their halls
CREATE POLICY "Staff can manage hall wallets"
ON player_wallets
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = player_wallets.hall_id
  )
);

-- Players can view their own wallets
CREATE POLICY "Players can view own wallets"
ON player_wallets
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Wallet Transactions: Enable RLS
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Super admins can view all transactions
CREATE POLICY "Super admins can view all transactions"
ON wallet_transactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

-- Staff can view transactions for their hall wallets
CREATE POLICY "Staff can view hall wallet transactions"
ON wallet_transactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM player_wallets
    INNER JOIN staff_assignments ON staff_assignments.hall_id = player_wallets.hall_id
    WHERE player_wallets.id = wallet_transactions.wallet_id
    AND staff_assignments.user_id = auth.uid()
  )
);

-- Players can view their own wallet transactions
CREATE POLICY "Players can view own transactions"
ON wallet_transactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM player_wallets
    WHERE player_wallets.id = wallet_transactions.wallet_id
    AND player_wallets.user_id = auth.uid()
  )
);

-- ============================================
-- 6. Helper Function: Get Wallet Balance
-- ============================================
CREATE OR REPLACE FUNCTION get_wallet_balance(wallet_uuid UUID)
RETURNS DECIMAL(10, 2) AS $$
  SELECT COALESCE(SUM(
    CASE 
      WHEN type = 'top_up' THEN amount
      WHEN type = 'refund' THEN amount
      WHEN type = 'deduction' THEN -amount
      ELSE 0
    END
  ), 0)
  FROM wallet_transactions
  WHERE wallet_id = wallet_uuid;
$$ LANGUAGE SQL STABLE;

-- ============================================
-- 7. Updated_at Trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_player_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER player_wallets_updated_at_trigger
BEFORE UPDATE ON player_wallets
FOR EACH ROW
EXECUTE FUNCTION update_player_wallets_updated_at();
