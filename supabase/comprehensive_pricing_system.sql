-- ========================================
-- نظام التسعير الشامل مع دعم عدد اللاعبين
-- ========================================

-- 1. إنشاء جدول الأسعار حسب الوقت (إذا لم يكن موجود)
CREATE TABLE IF NOT EXISTS device_time_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_type_id UUID NOT NULL REFERENCES device_types(id) ON DELETE CASCADE,
  hall_id UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  price_per_hour DECIMAL(10, 2) NOT NULL,
  price_dual DECIMAL(10, 2),
  price_quad DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_type_id, hall_id, start_time, end_time)
);

-- 2. إضافة فهرس للبحث السريع (إذا لم يكن موجود)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_device_time_pricing_lookup'
  ) THEN
    CREATE INDEX idx_device_time_pricing_lookup 
    ON device_time_pricing(device_type_id, hall_id);
  END IF;
END $$;

-- 3. تفعيل RLS
ALTER TABLE device_time_pricing ENABLE ROW LEVEL SECURITY;

-- 4. سياسات RLS
DROP POLICY IF EXISTS "Users can view pricing for their halls" ON device_time_pricing;
CREATE POLICY "Users can view pricing for their halls"
  ON device_time_pricing FOR SELECT
  USING (
    hall_id IN (
      SELECT hall_id FROM staff_assignments WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Managers can manage pricing" ON device_time_pricing;
CREATE POLICY "Managers can manage pricing"
  ON device_time_pricing FOR ALL
  USING (
    hall_id IN (
      SELECT hall_id FROM staff_assignments 
      WHERE user_id = auth.uid() AND role IN ('hall_manager', 'super_admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- 5. إضافة أعمدة الأسعار الثنائية والرباعية لجدول hall_devices
ALTER TABLE hall_devices 
ADD COLUMN IF NOT EXISTS dual_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS quad_price DECIMAL(10, 2);

-- 6. تحديث الأسعار الموجودة (نسخ السعر الافتراضي)
UPDATE hall_devices 
SET dual_price = price_per_hour, 
    quad_price = price_per_hour 
WHERE dual_price IS NULL OR quad_price IS NULL;

-- 7. إضافة عمود عدد اللاعبين للحجوزات
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS players_count INTEGER DEFAULT 2 CHECK (players_count IN (2, 4));

-- 8. تحديث الحجوزات الموجودة
UPDATE reservations SET players_count = 2 WHERE players_count IS NULL;

-- 9. دالة للحصول على السعر الحالي مع دعم عدد اللاعبين
DROP FUNCTION IF EXISTS get_current_device_price(UUID, UUID, TIME, INTEGER);
CREATE OR REPLACE FUNCTION get_current_device_price(
  p_device_type_id UUID,
  p_hall_id UUID,
  p_time TIME DEFAULT CURRENT_TIME,
  p_players_count INTEGER DEFAULT 2
)
RETURNS DECIMAL(10, 2) AS $$
DECLARE
  v_price DECIMAL(10, 2);
BEGIN
  -- البحث عن السعر حسب الوقت
  SELECT 
    CASE 
      WHEN p_players_count = 4 THEN COALESCE(price_quad, price_per_hour)
      ELSE COALESCE(price_dual, price_per_hour)
    END INTO v_price
  FROM device_time_pricing
  WHERE device_type_id = p_device_type_id
    AND hall_id = p_hall_id
    AND p_time >= start_time
    AND p_time < end_time
  ORDER BY start_time
  LIMIT 1;
  
  -- إذا لم يوجد سعر حسب الوقت، استخدم السعر الافتراضي
  IF v_price IS NULL THEN
    SELECT 
      CASE 
        WHEN p_players_count = 4 THEN COALESCE(quad_price, price_per_hour)
        ELSE COALESCE(dual_price, price_per_hour)
      END INTO v_price
    FROM hall_devices
    WHERE device_type_id = p_device_type_id
      AND hall_id = p_hall_id
    LIMIT 1;
  END IF;
  
  RETURN COALESCE(v_price, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- 10. تحديث الأسعار في device_time_pricing الموجودة
UPDATE device_time_pricing 
SET price_dual = price_per_hour, 
    price_quad = price_per_hour 
WHERE price_dual IS NULL OR price_quad IS NULL;
