-- Database Functions for Complex Operations
-- These functions run on the database server for better performance

-- ============================================
-- Function: Get Hall Overview Data
-- Returns all data needed for overview page in one call
-- ============================================
CREATE OR REPLACE FUNCTION get_hall_overview(hall_uuid UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'devices', (
      SELECT json_agg(json_build_object(
        'id', d.id,
        'name', d.name,
        'status', d.status,
        'active_session', (
          SELECT json_build_object(
            'id', s.id,
            'started_at', s.started_at,
            'user_id', s.user_id,
            'guest_name', r.guest_name
          )
          FROM sessions s
          LEFT JOIN reservations r ON r.id = s.reservation_id
          WHERE s.device_id = d.id AND s.ended_at IS NULL
          LIMIT 1
        )
      ))
      FROM devices d
      WHERE d.hall_id = hall_uuid
      ORDER BY d.name
    ),
    'pending_checkins', (
      SELECT json_agg(json_build_object(
        'id', r.id,
        'start_time', r.start_time,
        'end_time', r.end_time,
        'guest_name', r.guest_name,
        'user_id', r.user_id,
        'device_id', r.device_id,
        'device_name', d.name,
        'email', p.email
      ))
      FROM reservations r
      INNER JOIN devices d ON d.id = r.device_id
      LEFT JOIN profiles p ON p.id = r.user_id
      WHERE d.hall_id = hall_uuid
        AND r.status = 'confirmed'
        AND r.start_time <= NOW()
        AND r.end_time >= NOW()
      ORDER BY r.start_time
    ),
    'recent_reservations', (
      SELECT json_agg(json_build_object(
        'id', r.id,
        'start_time', r.start_time,
        'end_time', r.end_time,
        'status', r.status,
        'device_name', d.name
      ))
      FROM reservations r
      INNER JOIN devices d ON d.id = r.device_id
      WHERE d.hall_id = hall_uuid
      ORDER BY r.start_time DESC
      LIMIT 5
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- Function: Get Devices with Sessions
-- Returns devices with their active sessions and reservations
-- ============================================
CREATE OR REPLACE FUNCTION get_hall_devices_with_sessions(hall_uuid UUID)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'devices', (
        SELECT json_agg(row_to_json(device_row))
        FROM (
          SELECT 
            d.id,
            d.hall_id,
            d.name,
            d.status,
            d.last_heartbeat,
            d.device_type_id,
            json_build_object(
              'id', dt.id,
              'name', dt.name,
              'name_ar', dt.name_ar,
              'name_en', dt.name_en
            ) as device_type
          FROM devices d
          LEFT JOIN device_types dt ON dt.id = d.device_type_id
          WHERE d.hall_id = hall_uuid
          ORDER BY d.name
        ) device_row
      ),
      'sessions', (
        SELECT json_agg(json_build_object(
          'id', s.id,
          'device_id', s.device_id,
          'started_at', s.started_at,
          'user_id', s.user_id,
          'guest_name', r.guest_name
        ))
        FROM sessions s
        LEFT JOIN reservations r ON r.id = s.reservation_id
        WHERE s.hall_id = hall_uuid AND s.ended_at IS NULL
      ),
      'reservations', (
        SELECT json_agg(json_build_object(
          'id', r.id,
          'device_id', r.device_id
        ))
        FROM reservations r
        INNER JOIN devices d ON d.id = r.device_id
        WHERE d.hall_id = hall_uuid AND r.status = 'confirmed'
      ),
      'device_types', (
        SELECT json_agg(json_build_object(
          'id', dt.id,
          'name', dt.name,
          'name_ar', dt.name_ar,
          'name_en', dt.name_en
        ))
        FROM (
          SELECT DISTINCT dt.id, dt.name, dt.name_ar, dt.name_en
          FROM devices d
          INNER JOIN device_types dt ON dt.id = d.device_type_id
          WHERE d.hall_id = hall_uuid
        ) dt
      )
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- Function: Auto-end Expired Sessions
-- Automatically ends sessions that passed their reservation end time
-- ============================================
CREATE OR REPLACE FUNCTION auto_end_expired_sessions(hall_uuid UUID)
RETURNS JSON AS $$
DECLARE
  ended_count INTEGER := 0;
  expired_session RECORD;
BEGIN
  FOR expired_session IN
    SELECT s.id, s.device_id, s.started_at, s.reservation_id, r.end_time, d.price_per_hour
    FROM sessions s
    INNER JOIN reservations r ON r.id = s.reservation_id
    INNER JOIN devices d ON d.id = s.device_id
    WHERE s.hall_id = hall_uuid
      AND s.ended_at IS NULL
      AND r.end_time < NOW()
  LOOP
    DECLARE
      duration_hours NUMERIC;
      session_price NUMERIC;
      items_total NUMERIC;
    BEGIN
      -- Calculate duration and price
      duration_hours := EXTRACT(EPOCH FROM (expired_session.end_time - expired_session.started_at)) / 3600.0;
      session_price := duration_hours * expired_session.price_per_hour;
      
      -- Get session items total
      SELECT COALESCE(SUM(product_price * quantity), 0) INTO items_total
      FROM session_items
      WHERE session_id = expired_session.id;
      
      -- End session
      UPDATE sessions
      SET ended_at = expired_session.end_time
      WHERE id = expired_session.id;
      
      -- Update device status
      UPDATE devices
      SET status = 'available'
      WHERE id = expired_session.device_id;
      
      -- Update invoice
      UPDATE invoices
      SET ended_at = expired_session.end_time,
          duration_hours = duration_hours,
          rate_per_hour = expired_session.price_per_hour,
          session_price = session_price,
          items_total = items_total,
          total_price = session_price + items_total
      WHERE session_id = expired_session.id;
      
      ended_count := ended_count + 1;
    END;
  END LOOP;
  
  RETURN json_build_object('ended_sessions', ended_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function: Get Hall Reservations by Date
-- Returns reservations for a specific date with user emails
-- ============================================
CREATE OR REPLACE FUNCTION get_hall_reservations_by_date(
  hall_uuid UUID,
  target_date DATE
)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(json_build_object(
      'id', r.id,
      'start_time', r.start_time,
      'end_time', r.end_time,
      'status', r.status,
      'user_id', r.user_id,
      'guest_name', r.guest_name,
      'device_name', d.name,
      'email', COALESCE(r.guest_name, p.email, '—')
    ))
    FROM reservations r
    INNER JOIN devices d ON d.id = r.device_id
    LEFT JOIN profiles p ON p.id = r.user_id
    WHERE d.hall_id = hall_uuid
      AND DATE(r.start_time) = target_date
    ORDER BY r.start_time DESC
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- Function: Reset Orphaned Active Devices
-- Resets devices marked as active but have no active session
-- ============================================
CREATE OR REPLACE FUNCTION reset_orphaned_devices(hall_uuid UUID)
RETURNS JSON AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  WITH active_device_ids AS (
    SELECT device_id FROM sessions WHERE hall_id = hall_uuid AND ended_at IS NULL
  )
  UPDATE devices
  SET status = 'available'
  WHERE hall_id = hall_uuid
    AND status = 'active'
    AND id NOT IN (SELECT device_id FROM active_device_ids);
  
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  
  RETURN json_build_object('reset_devices', reset_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function: Get All Halls with Stats
-- Returns all halls with device statistics in one query
-- ============================================
CREATE OR REPLACE FUNCTION get_all_halls_with_stats()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(json_build_object(
      'id', h.id,
      'name', h.name,
      'address', h.address,
      'working_hours', h.working_hours,
      'created_at', h.created_at,
      'stats', json_build_object(
        'total', COALESCE(device_stats.total, 0),
        'available', COALESCE(device_stats.available, 0),
        'active', COALESCE(device_stats.active, 0),
        'offline', COALESCE(device_stats.offline, 0)
      )
    ))
    FROM halls h
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'available') as available,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'offline') as offline
      FROM devices d
      WHERE d.hall_id = h.id
    ) device_stats ON true
    ORDER BY h.name
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
