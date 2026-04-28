-- Add support for unpaid invoices
-- Allow invoices to be created even when payment is not completed

-- Add is_paid column to track payment status
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT true;

-- Make payment_id nullable since unpaid invoices won't have payment yet
ALTER TABLE invoices 
ALTER COLUMN payment_id DROP NOT NULL;

-- Add index for filtering unpaid invoices
CREATE INDEX IF NOT EXISTS idx_invoices_is_paid ON invoices(is_paid, created_at DESC);

-- Add index for hall unpaid invoices
CREATE INDEX IF NOT EXISTS idx_invoices_hall_unpaid ON invoices(hall_id, is_paid) WHERE is_paid = false;
