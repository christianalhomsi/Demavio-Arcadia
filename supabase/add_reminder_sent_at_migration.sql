-- Add reminder_sent_at column to reservations
-- Required by the send-reservation-reminders cron job for idempotency

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_reminder_sent_at
  ON reservations (reminder_sent_at)
  WHERE reminder_sent_at IS NULL;
