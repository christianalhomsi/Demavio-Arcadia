-- Fix orphaned 'active' reservations that have no active session
-- These were created by the old cron job before we disabled auto-activation

UPDATE reservations
SET status = 'confirmed'
WHERE status = 'active'
AND id NOT IN (
  SELECT reservation_id 
  FROM sessions 
  WHERE ended_at IS NULL 
  AND reservation_id IS NOT NULL
);

-- This will reset all 'active' reservations that don't have an active session
-- back to 'confirmed' so they can be checked in properly
