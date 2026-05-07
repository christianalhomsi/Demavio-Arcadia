-- Optimized RLS Policies using helper functions
-- This eliminates expensive subqueries in every policy check

-- Function to get user role (in public schema)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Function to check if user has hall access
CREATE OR REPLACE FUNCTION public.user_has_hall_access(hall_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_assignments 
    WHERE user_id = auth.uid() AND hall_id = hall_uuid
  ) OR public.get_user_role() = 'super_admin';
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ============================================
-- RESERVATIONS - Optimized Policies
-- ============================================

DROP POLICY IF EXISTS "Read reservations" ON reservations;
DROP POLICY IF EXISTS "Create reservations" ON reservations;
DROP POLICY IF EXISTS "Update reservations" ON reservations;

CREATE POLICY "Read reservations"
ON reservations FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.get_user_role() = 'super_admin'
  OR EXISTS (
    SELECT 1 FROM devices d
    INNER JOIN staff_assignments sa ON sa.hall_id = d.hall_id
    WHERE d.id = reservations.device_id AND sa.user_id = auth.uid()
  )
);

CREATE POLICY "Create reservations"
ON reservations FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR user_id IS NULL
  OR public.get_user_role() = 'super_admin'
  OR EXISTS (
    SELECT 1 FROM devices d
    INNER JOIN staff_assignments sa ON sa.hall_id = d.hall_id
    WHERE d.id = device_id AND sa.user_id = auth.uid()
  )
);

CREATE POLICY "Update reservations"
ON reservations FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.get_user_role() = 'super_admin'
  OR EXISTS (
    SELECT 1 FROM devices d
    INNER JOIN staff_assignments sa ON sa.hall_id = d.hall_id
    WHERE d.id = reservations.device_id AND sa.user_id = auth.uid()
  )
);

-- ============================================
-- PRODUCTS - Optimized Policies
-- ============================================

DROP POLICY IF EXISTS "Staff can read hall products" ON products;
DROP POLICY IF EXISTS "Staff can insert hall products" ON products;
DROP POLICY IF EXISTS "Staff can update hall products" ON products;
DROP POLICY IF EXISTS "Staff can delete hall products" ON products;

CREATE POLICY "Staff can read hall products"
ON products FOR SELECT
TO authenticated
USING (
  public.get_user_role() = 'super_admin'
  OR EXISTS (
    SELECT 1 FROM staff_assignments 
    WHERE user_id = auth.uid() AND hall_id = products.hall_id
  )
);

CREATE POLICY "Staff can insert hall products"
ON products FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role() = 'super_admin'
  OR EXISTS (
    SELECT 1 FROM staff_assignments 
    WHERE user_id = auth.uid() AND hall_id = products.hall_id
  )
);

CREATE POLICY "Staff can update hall products"
ON products FOR UPDATE
TO authenticated
USING (
  public.get_user_role() = 'super_admin'
  OR EXISTS (
    SELECT 1 FROM staff_assignments 
    WHERE user_id = auth.uid() AND hall_id = products.hall_id
  )
);

CREATE POLICY "Staff can delete hall products"
ON products FOR DELETE
TO authenticated
USING (
  public.get_user_role() = 'super_admin'
  OR EXISTS (
    SELECT 1 FROM staff_assignments 
    WHERE user_id = auth.uid() AND hall_id = products.hall_id
  )
);

-- ============================================
-- SESSIONS - Optimized Policies
-- ============================================

DROP POLICY IF EXISTS "Staff can read hall sessions" ON sessions;
DROP POLICY IF EXISTS "Staff can insert hall sessions" ON sessions;
DROP POLICY IF EXISTS "Staff can update hall sessions" ON sessions;

CREATE POLICY "Staff can read hall sessions"
ON sessions FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.get_user_role() = 'super_admin'
  OR EXISTS (
    SELECT 1 FROM staff_assignments 
    WHERE user_id = auth.uid() AND hall_id = sessions.hall_id
  )
);

CREATE POLICY "Staff can insert hall sessions"
ON sessions FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role() = 'super_admin'
  OR EXISTS (
    SELECT 1 FROM staff_assignments 
    WHERE user_id = auth.uid() AND hall_id = sessions.hall_id
  )
);

CREATE POLICY "Staff can update hall sessions"
ON sessions FOR UPDATE
TO authenticated
USING (
  public.get_user_role() = 'super_admin'
  OR EXISTS (
    SELECT 1 FROM staff_assignments 
    WHERE user_id = auth.uid() AND hall_id = sessions.hall_id
  )
);

-- ============================================
-- DEVICES - Optimized Policies
-- ============================================

DROP POLICY IF EXISTS "Staff can read hall devices" ON devices;
DROP POLICY IF EXISTS "Staff can update hall devices" ON devices;

CREATE POLICY "Staff can read hall devices"
ON devices FOR SELECT
TO authenticated
USING (
  public.get_user_role() = 'super_admin'
  OR EXISTS (
    SELECT 1 FROM staff_assignments 
    WHERE user_id = auth.uid() AND hall_id = devices.hall_id
  )
);

CREATE POLICY "Staff can update hall devices"
ON devices FOR UPDATE
TO authenticated
USING (
  public.get_user_role() = 'super_admin'
  OR EXISTS (
    SELECT 1 FROM staff_assignments 
    WHERE user_id = auth.uid() AND hall_id = devices.hall_id
  )
);
