-- Enable RLS on sessions table
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Super admins can do everything
CREATE POLICY "Super admins full access to sessions"
ON sessions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

-- Staff/Managers can view sessions for their halls
CREATE POLICY "Staff can view hall sessions"
ON sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = sessions.hall_id
  )
);

-- Staff/Managers can insert sessions for their halls
CREATE POLICY "Staff can insert hall sessions"
ON sessions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = sessions.hall_id
  )
);

-- Staff/Managers can update sessions for their halls
CREATE POLICY "Staff can update hall sessions"
ON sessions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = sessions.hall_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = sessions.hall_id
  )
);

-- Players can view their own sessions
CREATE POLICY "Players can view own sessions"
ON sessions
FOR SELECT
TO authenticated
USING (
  auth.uid() = sessions.user_id
);
