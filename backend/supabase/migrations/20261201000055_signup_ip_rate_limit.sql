-- Per-IP limit for email sign-up requests (signup-otp "request" action). Additive: the existing
-- per-email limits in pending_signup_begin are unchanged. Only a keyed hash of the IP is stored.
-- A blocked caller gets the existing 'wait' status, which web and mobile already handle.

create table public.signup_ip_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1
);

alter table public.signup_ip_limits enable row level security;
revoke all on public.signup_ip_limits from public, anon, authenticated;

-- Counts one sign-up request for this IP. Returns false once the IP made 10 requests in the
-- current one-hour window. The row lock makes concurrent requests from one IP count correctly.
create function public.signup_ip_allow(p_ip_hash text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.signup_ip_limits;
begin
  if p_ip_hash is null or length(p_ip_hash) <> 64 then
    perform public.raise_contract_error('VALIDATION', 'ip_hash');
  end if;
  delete from public.signup_ip_limits where window_started_at < now() - interval '1 day';
  insert into public.signup_ip_limits (ip_hash) values (p_ip_hash)
  on conflict (ip_hash) do update set
    request_count = case when signup_ip_limits.window_started_at > now() - interval '1 hour'
      then signup_ip_limits.request_count + 1 else 1 end,
    window_started_at = case when signup_ip_limits.window_started_at > now() - interval '1 hour'
      then signup_ip_limits.window_started_at else now() end
  returning * into r;
  return r.request_count <= 10;
end $$;

revoke execute on function public.signup_ip_allow(text) from public, anon, authenticated;
grant execute on function public.signup_ip_allow(text) to service_role;
