-- تفعيل RLS على جدول hall_devices
ALTER TABLE hall_devices ENABLE ROW LEVEL SECURITY;

-- السماح للـ super admin بكل العمليات
CREATE POLICY "Super admins can do everything on hall_devices"
ON hall_devices
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

-- السماح للجميع بالقراءة
CREATE POLICY "Anyone can read hall_devices"
ON hall_devices
FOR SELECT
TO authenticated
USING (true);
