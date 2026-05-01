-- Add INSERT and UPDATE policies for invoices table

-- Staff/Managers can insert invoices for their halls
CREATE POLICY "Staff can insert hall invoices"
ON invoices
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = invoices.hall_id
  )
);

-- Staff/Managers can update invoices for their halls
CREATE POLICY "Staff can update hall invoices"
ON invoices
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = invoices.hall_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = invoices.hall_id
  )
);

-- Super admins can insert/update all invoices
CREATE POLICY "Super admins can insert invoices"
ON invoices
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

CREATE POLICY "Super admins can update invoices"
ON invoices
FOR UPDATE
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
