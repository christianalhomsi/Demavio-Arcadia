-- إضافة عمود username إلى جدول profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- إنشاء index للبحث السريع
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- إضافة constraint للتأكد من أن username يحتوي على أحرف وأرقام فقط
ALTER TABLE profiles ADD CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]{3,20}$');
