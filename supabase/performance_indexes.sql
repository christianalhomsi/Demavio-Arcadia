-- Performance Indexes Migration
-- يجب تنفيذ هذا الملف على قاعدة البيانات

-- Indexes for sessions table
CREATE INDEX IF NOT EXISTS idx_sessions_ended_at ON sessions(ended_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_hall_id ON sessions(hall_id);
CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_reservation_id ON sessions(reservation_id);

-- Composite index for devices (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_devices_hall_status ON devices(hall_id, status);

-- Index for profiles role (used in RLS policies)
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Index for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_session_id ON invoices(session_id);
CREATE INDEX IF NOT EXISTS idx_invoices_hall_id ON invoices(hall_id);
CREATE INDEX IF NOT EXISTS idx_invoices_is_paid ON invoices(is_paid);

-- Index for wallet_transactions
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_session_id ON wallet_transactions(session_id);

-- Composite index for reservations (common query patterns)
CREATE INDEX IF NOT EXISTS idx_reservations_device_status ON reservations(device_id, status);
CREATE INDEX IF NOT EXISTS idx_reservations_start_time ON reservations(start_time);
CREATE INDEX IF NOT EXISTS idx_reservations_hall_start ON reservations(device_id, start_time);

-- Index for session_items
CREATE INDEX IF NOT EXISTS idx_session_items_session_id ON session_items(session_id);

-- Analyze tables to update statistics
ANALYZE sessions;
ANALYZE devices;
ANALYZE reservations;
ANALYZE profiles;
ANALYZE invoices;
ANALYZE wallet_transactions;
ANALYZE session_items;
