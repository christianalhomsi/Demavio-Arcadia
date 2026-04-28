-- حذف السياسات القديمة إذا كانت موجودة
DROP POLICY IF EXISTS "Users can read own reservations" ON reservations;
DROP POLICY IF EXISTS "Users can create reservations" ON reservations;
DROP POLICY IF EXISTS "Staff can read hall reservations" ON reservations;
DROP POLICY IF EXISTS "Staff can manage hall reservations" ON reservations;
DROP POLICY IF EXISTS "Staff can create hall reservations" ON reservations;
DROP POLICY IF EXISTS "Staff can update hall reservations" ON reservations;

-- تفعيل RLS
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- سياسة: المستخدمون يقدرون يقرأوا حجوزاتهم
CREATE POLICY "Users can read own reservations"
ON reservations FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- سياسة: المستخدمون يقدرون يحجزوا (user_id يجب أن يكون uid تبعهم — NULL مسموح للموظفين فقط)
CREATE POLICY "Users can create reservations"
ON reservations FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- سياسة: الموظفين يقدرون يقرأوا حجوزات الصالة تبعهم
CREATE POLICY "Staff can read hall reservations"
ON reservations FOR SELECT
TO authenticated
USING (
  device_id IN (
    SELECT id FROM devices 
    WHERE hall_id IN (
      SELECT hall_id FROM staff_assignments WHERE user_id = auth.uid()
    )
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);

-- سياسة: الموظفين يقدرون يضيفوا حجوزات للصالة تبعهم
CREATE POLICY "Staff can create hall reservations"
ON reservations FOR INSERT
TO authenticated
WITH CHECK (
  device_id IN (
    SELECT id FROM devices 
    WHERE hall_id IN (
      SELECT hall_id FROM staff_assignments WHERE user_id = auth.uid()
    )
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);

-- سياسة: الموظفين يقدرون يعدلوا حجوزات الصالة تبعهم
CREATE POLICY "Staff can update hall reservations"
ON reservations FOR UPDATE
TO authenticated
USING (
  device_id IN (
    SELECT id FROM devices 
    WHERE hall_id IN (
      SELECT hall_id FROM staff_assignments WHERE user_id = auth.uid()
    )
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
)
WITH CHECK (
  device_id IN (
    SELECT id FROM devices 
    WHERE hall_id IN (
      SELECT hall_id FROM staff_assignments WHERE user_id = auth.uid()
    )
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);
