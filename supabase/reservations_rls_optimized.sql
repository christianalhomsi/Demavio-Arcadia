-- حذف السياسات القديمة
DROP POLICY IF EXISTS "Users can read own reservations" ON reservations;
DROP POLICY IF EXISTS "Users can create reservations" ON reservations;
DROP POLICY IF EXISTS "Staff can read hall reservations" ON reservations;
DROP POLICY IF EXISTS "Staff can manage hall reservations" ON reservations;
DROP POLICY IF EXISTS "Staff can create hall reservations" ON reservations;
DROP POLICY IF EXISTS "Staff can update hall reservations" ON reservations;

-- تفعيل RLS
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- سياسة القراءة (محسّنة)
CREATE POLICY "Read reservations"
ON reservations FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR
  device_id IN (
    SELECT d.id FROM devices d
    INNER JOIN staff_assignments sa ON sa.hall_id = d.hall_id
    WHERE sa.user_id = auth.uid()
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) = 'super_admin'
);

-- سياسة الإضافة (محسّنة)
CREATE POLICY "Create reservations"
ON reservations FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR
  user_id IS NULL
  OR
  device_id IN (
    SELECT d.id FROM devices d
    INNER JOIN staff_assignments sa ON sa.hall_id = d.hall_id
    WHERE sa.user_id = auth.uid()
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) = 'super_admin'
);

-- سياسة التعديل (محسّنة)
CREATE POLICY "Update reservations"
ON reservations FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR
  device_id IN (
    SELECT d.id FROM devices d
    INNER JOIN staff_assignments sa ON sa.hall_id = d.hall_id
    WHERE sa.user_id = auth.uid()
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) = 'super_admin'
)
WITH CHECK (
  -- Regular users can only keep their own user_id
  user_id = auth.uid()
  OR
  -- Staff can update reservations for their hall (guest reservations have NULL user_id)
  device_id IN (
    SELECT d.id FROM devices d
    INNER JOIN staff_assignments sa ON sa.hall_id = d.hall_id
    WHERE sa.user_id = auth.uid()
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) = 'super_admin'
);

-- Trigger: prevent non-admins from changing user_id on existing reservations
CREATE OR REPLACE FUNCTION prevent_user_id_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    IF (SELECT role FROM profiles WHERE id = auth.uid()) != 'super_admin' THEN
      RAISE EXCEPTION 'Only super_admin can change reservation user_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_user_id_change ON reservations;
CREATE TRIGGER trg_prevent_user_id_change
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION prevent_user_id_change();

-- إنشاء indexes لتسريع الاستعلامات
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_device_id ON reservations(device_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_devices_hall_id ON devices(hall_id);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_user_hall ON staff_assignments(user_id, hall_id);
