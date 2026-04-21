-- إضافة عمود username إلى جدول otp_requests
ALTER TABLE otp_requests ADD COLUMN IF NOT EXISTS username TEXT;
