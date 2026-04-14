-- Run these in the Supabase SQL editor if not applied via CLI.
-- Adjust enum name/schema if yours differs.

-- PostgreSQL 15+: IF NOT EXISTS for enum labels
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'staff';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'manager';

-- Bootstrap your first platform admin (replace email):
-- UPDATE public.profiles
-- SET role = 'super_admin'::public.user_role, updated_at = now()
-- WHERE email = 'you@example.com';
