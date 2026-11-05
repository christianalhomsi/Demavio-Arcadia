-- Minimal stand-ins for what Supabase provides, so migrations can run on a plain Postgres (PGlite).
-- TEST HARNESS ONLY. Real environments use Supabase's own auth schema and roles.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;
create table auth.users (
  id                  uuid primary key,
  instance_id         uuid,
  aud                 text,
  role                text,
  email               text,
  raw_user_meta_data  jsonb,
  created_at          timestamptz,
  updated_at          timestamptz,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  raw_app_meta_data   jsonb,
  confirmation_token  text,
  recovery_token      text,
  email_change        text,
  email_change_token_new text,
  email_change_token_current text
);

create table auth.identities (
  id uuid primary key,
  user_id uuid references auth.users (id) on delete cascade,
  provider_id text,
  identity_data jsonb,
  provider text,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
);

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Reproduce what Supabase really does: every new table in public is granted to the API roles by
-- default. This is how a real project differs from a bare Postgres, and it hid a privilege gap.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
