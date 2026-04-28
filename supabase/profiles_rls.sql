-- تفعيل RLS على جدول profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- سياسة: المستخدمون يقدرون يقرأوا profile تبعهم
CREATE POLICY "Users can read own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- سياسة: المستخدمون يقدرون يعدلوا profile تبعهم
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- سياسة: Super admins يقدرون يعملوا كل شي
CREATE POLICY "Super admins can do everything on profiles"
ON profiles FOR ALL
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

-- سياسة: السماح بإنشاء profile جديد عند التسجيل
CREATE POLICY "Allow profile creation on signup"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);
