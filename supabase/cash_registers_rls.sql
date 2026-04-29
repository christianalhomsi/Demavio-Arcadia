-- Cash Registers RLS Policies

ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY;

-- Super admins can do everything
CREATE POLICY "Super admins full access to cash registers"
ON cash_registers
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

-- Staff/Managers can view cash registers for their halls
CREATE POLICY "Staff can view hall cash registers"
ON cash_registers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = cash_registers.hall_id
  )
);

-- Staff/Managers can insert cash registers for their halls
CREATE POLICY "Staff can open cash registers"
ON cash_registers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = cash_registers.hall_id
  )
);

-- Staff/Managers can update cash registers for their halls
CREATE POLICY "Staff can update hall cash registers"
ON cash_registers
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = cash_registers.hall_id
  )
);
