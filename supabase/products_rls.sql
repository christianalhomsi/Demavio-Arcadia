-- تفعيل RLS على جدول products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- سياسة: القراءة - الموظفين يقدرون يقرأوا منتجات الصالة تبعهم
CREATE POLICY "Staff can read hall products"
ON products FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = products.hall_id
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

-- سياسة: الإضافة - الموظفين يقدرون يضيفوا منتجات للصالة تبعهم
CREATE POLICY "Staff can insert hall products"
ON products FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = products.hall_id
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

-- سياسة: التعديل - الموظفين يقدرون يعدلوا منتجات الصالة تبعهم
CREATE POLICY "Staff can update hall products"
ON products FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = products.hall_id
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = products.hall_id
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

-- سياسة: الحذف - الموظفين يقدرون يحذفوا منتجات الصالة تبعهم
CREATE POLICY "Staff can delete hall products"
ON products FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff_assignments
    WHERE staff_assignments.user_id = auth.uid()
    AND staff_assignments.hall_id = products.hall_id
  )
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);
