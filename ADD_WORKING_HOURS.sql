-- Run this SQL in Supabase Dashboard > SQL Editor

-- Add working_hours column to halls table
ALTER TABLE halls ADD COLUMN IF NOT EXISTS working_hours JSONB;

-- Add comment to explain the structure
COMMENT ON COLUMN halls.working_hours IS 'Array of working hours per day: [{day: 0-6, open_time: "HH:MM", close_time: "HH:MM", is_open: boolean}]';

-- Optional: Set default working hours for existing halls (9 AM to 11 PM, all days open)
UPDATE halls 
SET working_hours = '[
  {"day": 0, "open_time": "09:00", "close_time": "23:00", "is_open": true},
  {"day": 1, "open_time": "09:00", "close_time": "23:00", "is_open": true},
  {"day": 2, "open_time": "09:00", "close_time": "23:00", "is_open": true},
  {"day": 3, "open_time": "09:00", "close_time": "23:00", "is_open": true},
  {"day": 4, "open_time": "09:00", "close_time": "23:00", "is_open": true},
  {"day": 5, "open_time": "09:00", "close_time": "23:00", "is_open": true},
  {"day": 6, "open_time": "09:00", "close_time": "23:00", "is_open": true}
]'::jsonb
WHERE working_hours IS NULL;
