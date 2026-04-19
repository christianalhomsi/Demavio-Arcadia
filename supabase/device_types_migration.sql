-- إنشاء جدول أنواع الأجهزة
CREATE TABLE IF NOT EXISTS device_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- إضافة الأنواع الافتراضية
INSERT INTO device_types (name, name_ar, name_en) VALUES
  ('pc', 'كمبيوتر', 'PC'),
  ('ps4', 'بلايستيشن 4', 'PlayStation 4'),
  ('ps5', 'بلايستيشن 5', 'PlayStation 5'),
  ('billiards', 'بلياردو', 'Billiards'),
  ('ping_pong', 'بينج بونج', 'Ping Pong')
ON CONFLICT (name) DO NOTHING;

-- إضافة عمود device_type_id إلى جدول devices
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_type_id UUID REFERENCES device_types(id);

-- إنشاء جدول hall_devices لربط الصالات بأنواع الأجهزة
CREATE TABLE IF NOT EXISTS hall_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  device_type_id UUID NOT NULL REFERENCES device_types(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(hall_id, device_type_id)
);

-- إنشاء index للأداء
CREATE INDEX IF NOT EXISTS idx_hall_devices_hall_id ON hall_devices(hall_id);
CREATE INDEX IF NOT EXISTS idx_devices_type_id ON devices(device_type_id);

-- تحديث الأجهزة الموجودة لتكون من نوع PC افتراضياً
UPDATE devices 
SET device_type_id = (SELECT id FROM device_types WHERE name = 'pc' LIMIT 1)
WHERE device_type_id IS NULL;

-- جعل device_type_id إلزامي بعد التحديث
ALTER TABLE devices ALTER COLUMN device_type_id SET NOT NULL;
