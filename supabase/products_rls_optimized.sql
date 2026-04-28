BEGIN;

-- حذف السياسات القديمة
DROP POLICY IF EXISTS "Staff can read hall products" ON products;
DROP POLICY IF EXISTS "Staff can insert hall products" ON products;
DROP POLICY IF EXISTS "Staff can update hall products" ON products;
DROP POLICY IF EXISTS "Staff can delete hall products" ON products;

-- سياسة واحدة للقراءة (أسرع)
CREATE POLICY "Staff can read hall products"
ON products FOR SELECT
TO authenticated
USING (
  hall_id IN (
    SELECT hall_id FROM staff_assignments WHERE user_id = auth.uid()
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);

-- سياسة واحدة للإضافة (أسرع)
CREATE POLICY "Staff can insert hall products"
ON products FOR INSERT
TO authenticated
WITH CHECK (
  hall_id IN (
    SELECT hall_id FROM staff_assignments WHERE user_id = auth.uid()
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);

-- سياسة واحدة للتعديل (أسرع)
CREATE POLICY "Staff can update hall products"
ON products FOR UPDATE
TO authenticated
USING (
  hall_id IN (
    SELECT hall_id FROM staff_assignments WHERE user_id = auth.uid()
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
)
WITH CHECK (
  hall_id IN (
    SELECT hall_id FROM staff_assignments WHERE user_id = auth.uid()
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);

-- سياسة واحدة للحذف (أسرع)
CREATE POLICY "Staff can delete hall products"
ON products FOR DELETE
TO authenticated
USING (
  hall_id IN (
    SELECT hall_id FROM staff_assignments WHERE user_id = auth.uid()
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);

COMMIT;
