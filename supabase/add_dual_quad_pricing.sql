-- إضافة أعمدة الأسعار الثنائية والرباعية
ALTER TABLE hall_devices 
ADD COLUMN IF NOT EXISTS dual_price DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS quad_price DECIMAL(10, 2);

-- تحديث الأسعار الموجودة (نسخ السعر الافتراضي)
UPDATE hall_devices 
SET dual_price = price_per_hour, 
    quad_price = price_per_hour 
WHERE dual_price IS NULL OR quad_price IS NULL;

-- إضافة أعمدة للأسعار الثنائية والرباعية في جدول device_time_pricing
ALTER TABLE device_time_pricing 
ADD COLUMN IF NOT EXISTS price_dual DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS price_quad DECIMAL(10, 2);

-- تحديث الأسعار الموجودة
UPDATE device_time_pricing 
SET price_dual = price_per_hour, 
    price_quad = price_per_hour 
WHERE price_dual IS NULL OR price_quad IS NULL;

-- تحديث دالة get_current_device_price لدعم الأسعار الثنائية والرباعية
CREATE OR REPLACE FUNCTION get_current_device_price(
  p_device_type_id UUID,
  p_hall_id UUID,
  p_time TIME DEFAULT CURRENT_TIME,
  p_players_count INTEGER DEFAULT 2
)
RETURNS DECIMAL(10, 2) AS $$
DECLARE
  v_price DECIMAL(10, 2);
  v_dual_price DECIMAL(10, 2);
  v_quad_price DECIMAL(10, 2);
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
