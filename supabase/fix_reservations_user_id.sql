-- السماح بـ null في عمود user_id للحجوزات الخاصة بالضيوف
ALTER TABLE reservations ALTER COLUMN user_id DROP NOT NULL;

-- إضافة constraint للتأكد من وجود إما user_id أو guest_name
ALTER TABLE reservations ADD CONSTRAINT user_or_guest_required 
CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL);
