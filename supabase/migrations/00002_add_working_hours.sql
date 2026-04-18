-- Add working_hours column to halls table
ALTER TABLE halls ADD COLUMN IF NOT EXISTS working_hours JSONB;

-- Add comment to explain the structure
COMMENT ON COLUMN halls.working_hours IS 'Array of working hours per day: [{day: 0-6, open_time: "HH:MM", close_time: "HH:MM", is_open: boolean}]';
