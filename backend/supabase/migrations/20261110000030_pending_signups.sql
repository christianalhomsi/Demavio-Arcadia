-- Email sign-up holds its details here until the emailed code is confirmed; only then does the
-- signup-otp Edge Function create the auth user. No password is ever stored.
--
-- One row per email, so asking for a new code never grants new guesses. Only service_role reaches
-- this table and its functions; both functions lock the row, so concurrent calls cannot race.

create table public.pending_signups (
  email text primary key,
  username text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  send_count integer not null default 1,
  last_sent_at timestamptz not null default now(),
  window_started_at timestamptz not null default now(),
  claimed_until timestamptz
);

alter table public.pending_signups enable row level security;
revoke all on public.pending_signups from public, anon, authenticated;

-- Stores a new code. Limits: one send per 60 seconds, 5 sends and 5 wrong guesses per hour.
create function public.pending_signup_begin(p_email text, p_username text, p_hash text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.pending_signups;
begin
  delete from public.pending_signups where window_started_at < now() - interval '1 day';
  select * into r from public.pending_signups where email = p_email for update;
  if found and r.last_sent_at > now() - interval '60 seconds' then return 'wait'; end if;
  if found and r.window_started_at > now() - interval '1 hour' and r.send_count >= 5 then
    return 'wait';
  end if;

  insert into public.pending_signups as p (email, username, code_hash, expires_at)
  values (p_email, p_username, p_hash, now() + interval '10 minutes')
  on conflict (email) do update set
    username = excluded.username,
    code_hash = excluded.code_hash,
    expires_at = excluded.expires_at,
    claimed_until = null,
    last_sent_at = now(),
    send_count = case when p.window_started_at > now() - interval '1 hour'
      then p.send_count + 1 else 1 end,
    attempts = case when p.window_started_at > now() - interval '1 hour'
      then p.attempts else 0 end,
    window_started_at = case when p.window_started_at > now() - interval '1 hour'
      then p.window_started_at else now() end;
  return 'ok';
end $$;

-- Checks a code. A match claims the row for 30 seconds while the account is created, so a second
-- submit of the same code fails. Returns the username, or null when the code is not accepted.
create function public.pending_signup_claim(p_email text, p_hash text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.pending_signups;
begin
  select * into r from public.pending_signups where email = p_email for update;
  if not found or r.expires_at < now() or r.attempts >= 5
     or (r.claimed_until is not null and r.claimed_until > now()) then
    return null;
  end if;
  if r.code_hash <> p_hash then
    update public.pending_signups set attempts = attempts + 1 where email = p_email;
    return null;
  end if;
  update public.pending_signups set claimed_until = now() + interval '30 seconds'
  where email = p_email;
  return r.username;
end $$;

revoke execute on function public.pending_signup_begin(text, text, text) from public, anon, authenticated;
revoke execute on function public.pending_signup_claim(text, text) from public, anon, authenticated;
grant execute on function public.pending_signup_begin(text, text, text) to service_role;
grant execute on function public.pending_signup_claim(text, text) to service_role;
grant select, delete, update on public.pending_signups to service_role;
