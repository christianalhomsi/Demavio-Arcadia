-- Add price_per_hour column to hall_devices table
ALTER TABLE hall_devices 
ADD COLUMN IF NOT EXISTS price_per_hour DECIMAL(10, 2) DEFAULT 0 NOT NULL;

-- Add comment to the column
COMMENT ON COLUMN hall_devices.price_per_hour IS 'Price per hour for this device type in this hall';
