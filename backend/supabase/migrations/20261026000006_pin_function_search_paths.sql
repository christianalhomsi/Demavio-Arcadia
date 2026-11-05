-- Found by the Supabase security advisor on the staging project (function_search_path_mutable):
-- three small helpers did not pin search_path. They do not touch tables, so this is hygiene, but
-- every function in the public schema should have a fixed search_path (spec §21.2).
alter function public.audit_logs_immutable() set search_path = public, pg_temp;
alter function public.raise_contract_error(text, text) set search_path = public, pg_temp;
alter function public.server_now() set search_path = public, pg_temp;
