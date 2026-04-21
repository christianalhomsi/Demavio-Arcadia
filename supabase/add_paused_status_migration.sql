-- Add 'paused' status to device_status enum
-- This allows devices to be temporarily paused for maintenance

ALTER TYPE device_status ADD VALUE IF NOT EXISTS 'paused';

-- Note: This migration is safe to run multiple times
-- The IF NOT EXISTS clause prevents errors if 'paused' already exists
