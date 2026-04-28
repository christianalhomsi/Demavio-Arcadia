-- Prevent concurrent active sessions on the same device at the DB level
-- This guards against TOCTOU race conditions in the check-in endpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_device_active
  ON sessions (device_id)
  WHERE ended_at IS NULL;
