-- Products & Session Items Feature Migration
-- Adds product catalog and session items functionality

-- ============================================
-- 1. Products Table (Hall-scoped catalog)
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_products_hall_id ON products(hall_id);
CREATE INDEX IF NOT EXISTS idx_products_hall_active ON products(hall_id, is_active);

-- ============================================
-- 2. Session Items Table (Cart/Invoice items)
-- ============================================
CREATE TABLE IF NOT EXISTS session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  -- Snapshot fields (preserve data even if product changes/deleted)
  product_name TEXT NOT NULL,
  product_price DECIMAL(10, 2) NOT NULL CHECK (product_price >= 0),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_session_items_session_id ON session_items(session_id);
CREATE INDEX IF NOT EXISTS idx_session_items_product_id ON session_items(product_id);

-- ============================================
-- 3. RLS Policies
-- ============================================

-- Products: Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Super admins can do everything on products
CREATE POLICY "Super admins can manage all products"
ON products
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

-- Staff/Managers can read products for their halls
CREATE POLICY "Staff can read hall products"
ON products
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = products.hall_id
  )
);

-- Session Items: Enable RLS
ALTER TABLE session_items ENABLE ROW LEVEL SECURITY;

-- Super admins can do everything on session items
CREATE POLICY "Super admins can manage all session items"
ON session_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

-- Staff/Managers can manage session items for their hall's sessions
CREATE POLICY "Staff can manage hall session items"
ON session_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM sessions
    INNER JOIN devices ON sessions.device_id = devices.id
    INNER JOIN staff_assignments ON staff_assignments.hall_id = devices.hall_id
    WHERE sessions.id = session_items.session_id
    AND staff_assignments.user_id = auth.uid()
  )
);

-- ============================================
-- 4. Updated_at Trigger for Products
-- ============================================
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at_trigger
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_products_updated_at();
