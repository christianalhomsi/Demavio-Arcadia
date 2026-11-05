-- Unique username on profiles (player sign-up asks for one besides the email and password).
--
-- Decisions (DEC-P21):
--  * A username is 3 to 20 characters: lowercase letters, digits and underscore. It is stored in lowercase
--    and is unique across all users, so "Sam" and "sam" are the same name.
--  * It is optional in the database, because accounts made before this change and Google sign-ins have none
--    yet. The sign-up form requires it for new email accounts and checks availability first.
--  * The database enforces the format and uniqueness itself; the web check is only for a friendly message.
--  * username_available is callable before sign-in (the sign-up form runs it). It answers only
--    true/false for one name, never lists anything.

set local search_path = public, extensions;

alter table public.profiles
  add column username text check (username is null or username ~ '^[a-z0-9_]{3,20}$');
create unique index profiles_username_idx on public.profiles (username) where username is not null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
begin
  insert into public.profiles (id, email, display_name, avatar_url, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    case when v_name ~ '^[a-z0-9_]{3,20}$' then v_name end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select lower(btrim(coalesce(p_username, ''))) ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(btrim(p_username)));
$$;

revoke execute on function public.username_available(text) from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
