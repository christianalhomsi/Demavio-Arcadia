-- إضافة عمود عدد اللاعبين للفواتير
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS players_count INTEGER DEFAULT 2 CHECK (players_count IN (2, 4));

-- تحديث الفواتير الموجودة
UPDATE invoices SET players_count = 2 WHERE players_count IS NULL;
