-- Add guest_name column to reservations table
-- This allows staff and managers to create reservations for walk-in guests

ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS guest_name TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN reservations.guest_name IS 'Name of guest for walk-in reservations (when user_id is null)';

-- Update the check constraint to allow either user_id or guest_name
-- First drop the old constraint if it exists
ALTER TABLE reservations 
DROP CONSTRAINT IF EXISTS reservations_user_or_guest_check;

-- Add new constraint: either user_id or guest_name must be present
ALTER TABLE reservations 
ADD CONSTRAINT reservations_user_or_guest_check 
CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL);
