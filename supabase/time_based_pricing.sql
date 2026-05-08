-- جدول الأسعار حسب الوقت
CREATE TABLE IF NOT EXISTS device_time_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_type_id UUID NOT NULL REFERENCES device_types(id) ON DELETE CASCADE,
  hall_id UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  price_per_hour DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_type_id, hall_id, start_time, end_time)
);

-- فهرس للبحث السريع
CREATE INDEX idx_device_time_pricing_lookup ON device_time_pricing(device_type_id, hall_id);

-- RLS
ALTER TABLE device_time_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pricing for their halls"
  ON device_time_pricing FOR SELECT
  USING (
    hall_id IN (
      SELECT hall_id FROM staff_assignments WHERE user_id = auth.uid()
      UNION
      SELECT id FROM halls WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Managers can manage pricing"
  ON device_time_pricing FOR ALL
  USING (
    hall_id IN (
      SELECT hall_id FROM staff_assignments 
      WHERE user_id = auth.uid() AND role IN ('hall_manager', 'super_admin')
      UNION
      SELECT id FROM halls WHERE owner_id = auth.uid()
    )
  );

-- دالة للحصول على السعر الحالي
CREATE OR REPLACE FUNCTION get_current_device_price(
  p_device_type_id UUID,
  p_hall_id UUID,
  p_time TIME DEFAULT CURRENT_TIME
)
RETURNS DECIMAL(10, 2) AS $$
DECLARE
  v_price DECIMAL(10, 2);
BEGIN
  -- البحث عن السعر حسب الوقت
  SELECT price_per_hour INTO v_price
  FROM device_time_pricing
  WHERE device_type_id = p_device_type_id
    AND hall_id = p_hall_id
    AND p_time >= start_time
    AND p_time < end_time
  ORDER BY start_time
  LIMIT 1;
  
  -- إذا لم يوجد سعر حسب الوقت، استخدم السعر الافتراضي
  IF v_price IS NULL THEN
    SELECT price_per_hour INTO v_price
    FROM hall_devices
    WHERE device_type_id = p_device_type_id
      AND hall_id = p_hall_id
    LIMIT 1;
  END IF;
  
  RETURN COALESCE(v_price, 0);
END;
$$ LANGUAGE plpgsql STABLE;
