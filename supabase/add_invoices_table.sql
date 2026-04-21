-- Invoices Table
-- Stores final invoice/receipt when session ends and payment is made

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  hall_id UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Session details
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_hours DECIMAL(10, 2) NOT NULL,
  rate_per_hour DECIMAL(10, 2) NOT NULL,
  session_price DECIMAL(10, 2) NOT NULL,
  
  -- Items snapshot (JSON array of items)
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  items_total DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Total
  total_price DECIMAL(10, 2) NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_session_id ON invoices(session_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_id ON invoices(payment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_hall_id ON invoices(hall_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Super admins can view all invoices
CREATE POLICY "Super admins can view all invoices"
ON invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

-- Staff/Managers can view invoices for their halls
CREATE POLICY "Staff can view hall invoices"
ON invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = invoices.hall_id
  )
);
