# تطبيق RLS Policies على hall_devices

## الخطوات:

1. افتح Supabase Dashboard
2. اذهب إلى SQL Editor
3. انسخ محتوى ملف `hall_devices_rls.sql`
4. الصقه في الـ SQL Editor
5. اضغط Run

## أو استخدم الأوامر التالية مباشرة:

```sql
-- تفعيل RLS
ALTER TABLE hall_devices ENABLE ROW LEVEL SECURITY;

-- سياسة للـ super admin
CREATE POLICY "Super admins can do everything on hall_devices"
ON hall_devices FOR ALL TO authenticated
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

-- سياسة القراءة للجميع
CREATE POLICY "Anyone can read hall_devices"
ON hall_devices FOR SELECT TO authenticated
USING (true);
```

بعد تطبيق هذه الـ policies، المشكلة راح تنحل! ✅
