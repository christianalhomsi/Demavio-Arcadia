-- Add password_hash column to otp_requests table for signup flow
ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS password_hash TEXT;
