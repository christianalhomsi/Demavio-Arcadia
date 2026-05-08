-- إضافة عمود عدد اللاعبين للحجوزات
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS players_count INTEGER DEFAULT 2 CHECK (players_count IN (2, 4));

-- تحديث الحجوزات الموجودة
UPDATE reservations SET players_count = 2 WHERE players_count IS NULL;
