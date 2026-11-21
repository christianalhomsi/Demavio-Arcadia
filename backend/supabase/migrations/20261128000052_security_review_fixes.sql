-- Security fixes from the review of 2026-11-21.
--
-- 1. Only an active owner can make someone an owner, or change, demote or deactivate an owner. A member who
--    was delegated employee.manage could otherwise invite a second account as owner and push the real owner out.
--    Discount limits are also owner-only, and an owner invitation needs its inviter to still be an owner.
-- 2. Hall staff no longer see a customer's email address: customers are shown by name or @username. Staff
--    could resolve any platform username to a private email through a wallet. The email-based wallet lookups
--    (open_wallet, link_guest_wallet), unused by the apps since usernames, are closed to clients.
-- 3. Accounts can be created only by the app's own paths (the OTP sign-up, owner accounts made by the platform)
--    or by Google. Supabase's built-in email sign-up, open to anyone with the public key, is refused, so nobody
--    can pre-register someone else's email.
-- 4. A sales manager who lost the sales_admin role (or was deactivated) can no longer approve or reject hall
--    requests; their pending requests go back to the shared queue, new requests skip them, and a deactivated
--    account is banned from signing in.

-- ---------------------------------------------------------------------------
-- 1. Owner-only role changes
-- ---------------------------------------------------------------------------
create or replace function public.is_hall_owner(p_hall_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.hall_memberships
                  where hall_id = p_hall_id and user_id = auth.uid() and role_key = 'owner' and status = 'active')
     and public.is_active_user();
$$;
revoke execute on function public.is_hall_owner(uuid) from public, anon, authenticated;

create or replace function public.update_member(p_membership_id uuid, p_role text, p_discount_limit_minor bigint, p_grants text[])
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m public.hall_memberships; v_before jsonb; v_grant text; v_grants text[] := coalesce(p_grants, '{}');
begin
  select * into v_m from public.hall_memberships where id = p_membership_id for update;
  if not found or not public.has_hall_permission(v_m.hall_id, 'employee.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_m.user_id = auth.uid() then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'cannot_modify_self');
  end if;
  if not exists (select 1 from public.roles where key = p_role and scope = 'hall') then
    perform public.raise_contract_error('VALIDATION', 'role');
  end if;
  -- Owners only: making or changing an owner, and discount limits (owners themselves are unlimited).
  if (p_role = 'owner' or v_m.role_key = 'owner') and not public.is_hall_owner(v_m.hall_id) then
    perform public.raise_contract_error('PERMISSION_DENIED', 'owner_only');
  end if;
  if p_discount_limit_minor is distinct from v_m.discount_limit_minor and not public.is_hall_owner(v_m.hall_id) then
    perform public.raise_contract_error('PERMISSION_DENIED', 'owner_only');
  end if;
  if p_discount_limit_minor is not null and p_discount_limit_minor < 0 then
    perform public.raise_contract_error('VALIDATION', 'discount_limit');
  end if;
  if v_m.role_key = 'owner' and p_role <> 'owner' and v_m.status = 'active'
     and not exists (select 1 from public.hall_memberships
                      where hall_id = v_m.hall_id and role_key = 'owner' and status = 'active' and id <> v_m.id) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'last_owner');
  end if;

  foreach v_grant in array v_grants loop
    if v_grant = 'platform.tenants.manage'
       or not exists (select 1 from public.permissions where key = v_grant)
       or not public.has_hall_permission(v_m.hall_id, v_grant) then
      perform public.raise_contract_error('VALIDATION', 'grant');
    end if;
  end loop;

  select jsonb_build_object('role', v_m.role_key, 'discount_limit_minor', v_m.discount_limit_minor,
    'grants', coalesce((select jsonb_agg(permission_key order by permission_key)
                          from public.hall_membership_grants where membership_id = v_m.id), '[]'::jsonb))
    into v_before;

  update public.hall_memberships set role_key = p_role, discount_limit_minor = p_discount_limit_minor where id = v_m.id;
  delete from public.hall_membership_grants where membership_id = v_m.id;
  insert into public.hall_membership_grants (membership_id, permission_key)
    select v_m.id, g from unnest(v_grants) g on conflict do nothing;

  perform public.write_audit(v_m.hall_id, 'employee.update', 'membership', v_m.id::text, null, v_before,
    jsonb_build_object('role', p_role, 'discount_limit_minor', p_discount_limit_minor, 'grants', to_jsonb(v_grants)));
end $$;

create or replace function public.invite_member(p_hall_id uuid, p_email text, p_role text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_token text; v_email text := lower(btrim(p_email)); v_id uuid;
begin
  if not public.has_hall_permission(p_hall_id, 'employee.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    perform public.raise_contract_error('VALIDATION', 'email');
  end if;
  if not exists (select 1 from public.roles where key = p_role and scope = 'hall') then
    perform public.raise_contract_error('VALIDATION', 'role');
  end if;
  if p_role = 'owner' and not public.is_hall_owner(p_hall_id) then
    perform public.raise_contract_error('PERMISSION_DENIED', 'owner_only');
  end if;
  if exists (select 1 from public.hall_memberships m join public.profiles p on p.id = m.user_id
              where m.hall_id = p_hall_id and lower(p.email) = v_email and m.status = 'active') then
    perform public.raise_contract_error('CONFLICT', 'already_member');
  end if;
  if exists (select 1 from public.hall_invitations
              where hall_id = p_hall_id and lower(email) = v_email and status = 'pending' and expires_at > now()) then
    perform public.raise_contract_error('CONFLICT', 'already_invited');
  end if;
  -- Expired pending invitations no longer block a re-invite.
  update public.hall_invitations set status = 'revoked'
   where hall_id = p_hall_id and lower(email) = v_email and status = 'pending' and expires_at <= now();

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.hall_invitations (hall_id, email, role_key, token_hash, invited_by)
  values (p_hall_id, v_email, p_role, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), auth.uid())
  returning id into v_id;

  perform public.write_audit(p_hall_id, 'employee.invite', 'invitation', v_id::text, null, null,
    jsonb_build_object('email', v_email, 'role', p_role));
  return v_token;
end $$;

create or replace function public.set_member_status(p_membership_id uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_m public.hall_memberships;
begin
  select * into v_m from public.hall_memberships where id = p_membership_id for update;
  if not found or not public.has_hall_permission(v_m.hall_id, 'employee.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_status not in ('active', 'inactive') then
    perform public.raise_contract_error('VALIDATION', 'status');
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    perform public.raise_contract_error('VALIDATION', 'reason');
  end if;
  if v_m.user_id = auth.uid() then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'cannot_modify_self');
  end if;
  if v_m.role_key = 'owner' and not public.is_hall_owner(v_m.hall_id) then
    perform public.raise_contract_error('PERMISSION_DENIED', 'owner_only');
  end if;
  if p_status = 'inactive' and v_m.role_key = 'owner' and v_m.status = 'active'
     and not exists (select 1 from public.hall_memberships
                      where hall_id = v_m.hall_id and role_key = 'owner' and status = 'active' and id <> v_m.id) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'last_owner');
  end if;

  update public.hall_memberships set status = p_status where id = v_m.id;
  perform public.write_audit(v_m.hall_id, 'employee.status', 'membership', v_m.id::text, btrim(p_reason),
    jsonb_build_object('status', v_m.status), jsonb_build_object('status', p_status));
end $$;

create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_inv public.hall_invitations; v_email text; v_membership uuid;
begin
  if auth.uid() is null or not public.is_active_user() then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  select lower(email) into v_email from public.profiles where id = auth.uid();

  select * into v_inv from public.hall_invitations
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
   for update;
  if not found or v_inv.status <> 'pending' or v_inv.expires_at <= now() or lower(v_inv.email) <> v_email then
    perform public.raise_contract_error('NOT_FOUND');
  end if;

  -- An owner invitation is honoured only while the person who sent it is still an active owner of the hall,
  -- or an active super admin (who invites the first owner of a new hall).
  if v_inv.role_key = 'owner' and not exists (
       select 1 from public.hall_memberships m join public.profiles p on p.id = m.user_id
        where m.hall_id = v_inv.hall_id and m.user_id = v_inv.invited_by and m.role_key = 'owner'
          and m.status = 'active' and p.status = 'active')
     and not exists (
       select 1 from public.user_role_assignments a join public.profiles p on p.id = a.user_id
        where a.user_id = v_inv.invited_by and a.role_key = 'super_admin' and p.status = 'active') then
    perform public.raise_contract_error('NOT_FOUND');
  end if;

  insert into public.hall_memberships (hall_id, user_id, role_key, status)
  values (v_inv.hall_id, auth.uid(), v_inv.role_key, 'active')
  on conflict (hall_id, user_id) do update set role_key = excluded.role_key, status = 'active'
  returning id into v_membership;

  update public.hall_invitations set status = 'accepted' where id = v_inv.id;
  perform public.write_audit(v_inv.hall_id, 'employee.invite.accept', 'membership', v_membership::text, null, null,
    jsonb_build_object('role', v_inv.role_key));
  return v_inv.hall_id;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Customers are shown by name or @username, never by email
-- ---------------------------------------------------------------------------

create or replace function public.list_wallets(p_hall_id uuid, p_search text default null, p_limit int default 25, p_offset int default 0, p_wallet_id uuid default null)
returns table (id uuid, customer_name text, customer_email text, currency char(3), status text, balance_minor bigint,
               last_activity timestamptz, total bigint, guest_phone text, is_guest boolean, username text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'wallet.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select w.id, coalesce(p.display_name, w.guest_name), null::text, w.currency, w.status, w.balance_minor,
           (select max(t.created_at) from public.wallet_transactions t where t.wallet_id = w.id), count(*) over (),
           w.guest_phone, (w.customer_id is null), p.username
      from public.wallets w left join public.profiles p on p.id = w.customer_id
     where w.hall_id = p_hall_id and (p_wallet_id is null or w.id = p_wallet_id)
       and (p_search is null or p.display_name ilike '%' || p_search || '%'
            or p.username ilike '%' || p_search || '%'
            or w.guest_name ilike '%' || p_search || '%' or w.guest_phone ilike '%' || p_search || '%')
     order by coalesce(p.username, p.display_name, w.guest_name) nulls last, w.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create or replace function public.invoice_payer(p_invoice_id uuid)
returns table (label text, is_guest boolean, wallet_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_i public.invoices; v_p public.profiles; v_w uuid;
begin
  select * into v_i from public.invoices where id = p_invoice_id;
  if not found or not (public.has_hall_permission(v_i.hall_id, 'payment.collect')
                       or public.has_hall_permission(v_i.hall_id, 'invoice.view')) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_i.customer_id is not null then
    select * into v_p from public.profiles where id = v_i.customer_id;
    select id into v_w from public.wallets where hall_id = v_i.hall_id and customer_id = v_i.customer_id;
    return query select coalesce('@' || v_p.username, v_p.display_name), false, v_w;
  else
    select id into v_w from public.wallets
     where hall_id = v_i.hall_id and customer_id is null and lower(btrim(guest_name)) = lower(btrim(coalesce(v_i.guest_name, '')));
    return query select v_i.guest_name, true, v_w;
  end if;
end $$;

create or replace function public.list_sessions(
  p_hall_id uuid, p_active_only boolean default false, p_limit int default 25, p_offset int default 0,
  p_session_id uuid default null
)
returns table (
  id uuid, device_id uuid, device_name text, customer_name text, session_type text, status text,
  started_at timestamptz, scheduled_end_at timestamptz, ended_at timestamptz, end_type text,
  billable_seconds int, extension_count int, reservation_id uuid, total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'session.start') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select s.id, s.device_id, d.name, coalesce(s.guest_name, p.display_name, '@' || p.username), s.session_type, s.status,
           s.started_at, s.scheduled_end_at, s.ended_at, s.end_type, s.billable_seconds, s.extension_count,
           s.reservation_id, count(*) over ()
      from public.sessions s
      join public.devices d on d.id = s.device_id
      left join public.profiles p on p.id = s.customer_id
     where s.hall_id = p_hall_id
       and (p_session_id is null or s.id = p_session_id)
       and (not p_active_only or s.status in ('starting', 'in_progress', 'ending'))
     order by s.started_at desc, s.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create or replace function public.list_reservations(
  p_hall_id uuid, p_from timestamptz, p_to timestamptz, p_status text default null
)
returns table (
  id uuid, device_id uuid, device_name text, customer_name text, status text,
  start_at timestamptz, end_at timestamptz, session_id uuid, cancel_reason text, players_count smallint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'reservation.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select r.id, r.device_id, d.name, coalesce(r.guest_name, p.display_name, '@' || p.username), r.status,
           r.start_at, r.end_at, s.id, r.cancel_reason, r.players_count
      from public.reservations r
      join public.devices d on d.id = r.device_id
      left join public.profiles p on p.id = r.customer_id
      left join public.sessions s on s.reservation_id = r.id
     where r.hall_id = p_hall_id and r.start_at < p_to and r.end_at > p_from
       and (p_status is null or r.status = p_status)
     order by r.start_at, d.name
     limit 500;
end $$;

create or replace function public.list_invoices(
  p_hall_id uuid, p_status text default null, p_outstanding_only boolean default false,
  p_limit int default 25, p_offset int default 0, p_invoice_id uuid default null
)
returns table (
  id uuid, number text, session_id uuid, device_name text, customer_name text, currency char(3),
  total_minor bigint, paid_minor bigint, refunded_minor bigint, outstanding_minor bigint, status text,
  billable_seconds int, billed_minutes int, created_at timestamptz, total bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'invoice.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select i.id, i.number, i.session_id, d.name, coalesce(i.guest_name, p.display_name, '@' || p.username), i.currency,
           i.total_minor, i.paid_minor, i.refunded_minor, i.outstanding_minor, i.status,
           i.billable_seconds, i.billed_minutes, i.created_at, count(*) over ()
      from public.invoices i
      join public.sessions s on s.id = i.session_id
      join public.devices d on d.id = s.device_id
      left join public.profiles p on p.id = i.customer_id
     where i.hall_id = p_hall_id
       and (p_invoice_id is null or i.id = p_invoice_id)
       and (p_status is null or i.status = p_status)
       and (not p_outstanding_only or i.outstanding_minor > 0)
     order by i.created_at desc, i.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create or replace function public.get_shift_unpaid_summary(p_shift_id uuid)
returns table (invoice_id uuid, number text, session_id uuid, device_name text, customer_name text, ended_at timestamptz,
               total_minor bigint, outstanding_minor bigint, currency char(3), status text, in_shift boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_sh public.shifts;
begin
  select * into v_sh from public.shifts where id = p_shift_id;
  if not found or not public.has_hall_permission(v_sh.hall_id, 'shift.close') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select i.id, i.number, i.session_id, d.name, coalesce(i.guest_name, p.display_name, '@' || p.username), s.ended_at,
           i.total_minor, i.outstanding_minor, i.currency, i.status, i.created_at >= v_sh.opened_at
      from public.invoices i
      join public.sessions s on s.id = i.session_id
      join public.devices d on d.id = s.device_id
      left join public.profiles p on p.id = i.customer_id
     where i.hall_id = v_sh.hall_id and i.status in ('open', 'partially_paid') and i.outstanding_minor > 0
     order by (i.created_at >= v_sh.opened_at) desc, s.ended_at, i.id;
end $$;

create or replace function public.get_payment_detail(p_payment_id uuid)
returns table (id uuid, invoice_id uuid, invoice_number text, method text, amount_minor bigint, currency char(3),
               status text, operator_name text, shift_id uuid, customer_name text, created_at timestamptz,
               refunded_minor bigint, refund_pending_minor bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_hall uuid;
begin
  select pay.hall_id into v_hall from public.payments pay where pay.id = p_payment_id;
  if v_hall is null or not public.has_hall_permission(v_hall, 'invoice.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select pay.id, pay.invoice_id, i.number, pay.method, pay.amount_minor, pay.currency, pay.status,
           coalesce(op.display_name, op.email), pay.shift_id, coalesce(cu.display_name, '@' || cu.username), pay.created_at,
           coalesce((select sum(r.amount_minor) from public.refunds r where r.payment_id = pay.id and r.status = 'approved'), 0)::bigint,
           coalesce((select sum(r.amount_minor) from public.refunds r where r.payment_id = pay.id and r.status = 'pending'), 0)::bigint
      from public.payments pay
      join public.invoices i on i.id = pay.invoice_id
      left join public.profiles op on op.id = pay.created_by
      left join public.profiles cu on cu.id = i.customer_id
     where pay.id = p_payment_id;
end $$;

revoke execute on function public.open_wallet(uuid, text), public.link_guest_wallet(uuid, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Only the app's own sign-up paths (and Google) may create accounts
-- ---------------------------------------------------------------------------
-- An email/password account must come from the SQL account helpers below (app_metadata.arcadia_signup = 'trusted',
-- which a client cannot set) or from signup-otp after the emailed code was verified. A client calling Supabase's
-- /auth/v1/signup has neither, so that path now fails and creates nothing.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')));
begin
  -- Email accounts come from the SQL helpers (marked trusted) or from signup-otp, which claims the verified code
  -- in pending_signups just before it creates the user (the claim exists at insert time, whatever order Auth
  -- writes app_metadata in).
  if coalesce(new.raw_app_meta_data ->> 'provider', '') = 'email'
     and coalesce(new.raw_app_meta_data ->> 'arcadia_signup', '') <> 'trusted'
     and not exists (select 1 from public.pending_signups ps
                      where ps.email = lower(new.email) and ps.claimed_until > now()) then
    raise exception 'Sign-up is only possible through the app' using errcode = '42501';
  end if;
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

create or replace function public.create_login_user(
  p_email text, p_password text, p_username text, p_display_name text
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_id uuid := gen_random_uuid();
begin
  if not public.valid_email(v_email) then perform public.raise_contract_error('VALIDATION', 'email'); end if;
  if p_password is null or length(p_password) < 8 or length(p_password) > 72 then
    perform public.raise_contract_error('VALIDATION', 'password');
  end if;
  if v_username !~ '^[a-z0-9_]{3,20}$' then perform public.raise_contract_error('VALIDATION', 'username'); end if;
  if v_name is not null and length(v_name) > 120 then perform public.raise_contract_error('VALIDATION', 'name'); end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    perform public.raise_contract_error('CONFLICT', 'email_taken');
  end if;
  if exists (select 1 from public.profiles where username = v_username) then
    perform public.raise_contract_error('CONFLICT', 'username_taken');
  end if;

  -- The profile row is created by the handle_new_user trigger from the metadata below.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"arcadia_signup":"trusted"}'::jsonb,
    jsonb_build_object('full_name', coalesce(v_name, v_username), 'username', v_username),
    now(), now(), '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  return v_id;
end $$;

create or replace function public.create_login_user_hashed(p_email text, p_hash text, p_username text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_id uuid := gen_random_uuid();
begin
  if not public.valid_email(v_email) then perform public.raise_contract_error('VALIDATION', 'email'); end if;
  if v_username !~ '^[a-z0-9_]{3,20}$' then perform public.raise_contract_error('VALIDATION', 'username'); end if;
  if p_hash is null or length(p_hash) < 20 then perform public.raise_contract_error('VALIDATION', 'password'); end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    perform public.raise_contract_error('CONFLICT', 'email_taken');
  end if;
  if exists (select 1 from public.profiles where username = v_username) then
    perform public.raise_contract_error('CONFLICT', 'username_taken');
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    p_hash, now(),
    '{"provider":"email","providers":["email"],"arcadia_signup":"trusted"}'::jsonb,
    jsonb_build_object('full_name', coalesce(nullif(btrim(p_display_name), ''), v_username), 'username', v_username),
    now(), now(), '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Removed managers lose approval rights; deactivated accounts cannot sign in
-- ---------------------------------------------------------------------------

create or replace function public.approve_hall_request(p_request_id uuid, p_key uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_r public.hall_requests; v_is_admin boolean; v_is_mgr boolean; v_owner uuid; v_hall uuid;
begin
  v_is_admin := public.has_platform_role('super_admin');
  select * into v_r from public.hall_requests where id = p_request_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  v_is_mgr := (v_r.manager_id is not null and v_r.manager_id = auth.uid() and public.has_platform_role('sales_admin'))
           or (v_r.manager_id is null and public.has_platform_role('sales_admin'));
  if not (v_is_admin or v_is_mgr) then perform public.raise_contract_error('PERMISSION_DENIED'); end if;
  if v_r.status <> 'pending' then perform public.raise_contract_error('PRECONDITION_FAILED', 'not_pending'); end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
  if v_r.subscription_plan_id is not null
     and not exists (select 1 from public.subscription_plans where id = v_r.subscription_plan_id and status = 'active') then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'plan_inactive');
  end if;

  v_owner := public.create_login_user_hashed(v_r.owner_email, v_r.owner_password_hash, v_r.owner_username, v_r.hall_name);
  v_hall := public.provision_hall(v_r.hall_name, 'Asia/Damascus', v_r.currency, p_key);
  if v_r.subscription_plan_id is not null then
    perform public.apply_hall_subscription(v_hall, v_r.subscription_plan_id);
  end if;
  insert into public.hall_memberships (hall_id, user_id, role_key, status) values (v_hall, v_owner, 'owner', 'active');
  insert into public.sales_attributions (hall_id, agent_id) values (v_hall, v_r.requested_by);
  update public.hall_requests
     set status = 'approved', hall_id = v_hall, owner_password_hash = null, updated_at = now(),
         manager_approved_by = case when v_is_mgr then auth.uid() end,
         manager_approved_at = case when v_is_mgr then now() end,
         admin_approved_by = case when v_is_admin then auth.uid() end,
         admin_approved_at = case when v_is_admin then now() end
   where id = p_request_id;
  perform public.write_audit(v_hall, 'sales.hall_request.activate', 'hall_request', p_request_id::text, null, null,
    jsonb_build_object('hall_id', v_hall, 'owner_id', v_owner, 'agent_id', v_r.requested_by,
                       'as_manager', v_is_mgr, 'as_admin', v_is_admin, 'plan_id', v_r.subscription_plan_id));
  return jsonb_build_object('status', 'approved', 'hall_id', v_hall);
end $$;

create or replace function public.reject_hall_request(p_request_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_r public.hall_requests; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_r from public.hall_requests where id = p_request_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if not (public.has_platform_role('super_admin')
          or (v_r.manager_id is not null and v_r.manager_id = auth.uid() and public.has_platform_role('sales_admin'))
          or (v_r.manager_id is null and public.has_platform_role('sales_admin'))) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_r.status <> 'pending' then perform public.raise_contract_error('PRECONDITION_FAILED', 'not_pending'); end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  update public.hall_requests
     set status = 'rejected', rejected_by = auth.uid(), rejected_reason = v_reason, owner_password_hash = null, updated_at = now()
   where id = p_request_id;
  perform public.write_audit(null, 'sales.hall_request.reject', 'hall_request', p_request_id::text, null, null,
    jsonb_build_object('reason', v_reason));
end $$;

create or replace function public.list_hall_requests(p_status text default null, p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, hall_name text, currency text, owner_email text, owner_username text,
  requested_by_name text, manager_name text, status text,
  rejected_reason text, hall_id uuid, can_act boolean, created_at timestamptz, total bigint,
  plan_name text, plan_kind text, plan_period text, plan_price_minor bigint, plan_currency text,
  plan_available boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_admin boolean := public.has_platform_role('super_admin'); v_sales_admin boolean := public.has_platform_role('sales_admin');
begin
  if not (v_admin or public.has_platform_role('sales_agent') or v_sales_admin) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select r.id, r.hall_name, r.currency, r.owner_email, r.owner_username,
           coalesce(pr.display_name, pr.email), coalesce(pm.display_name, pm.email), r.status,
           r.rejected_reason, r.hall_id,
           r.status = 'pending' and (
             v_admin
             or (r.manager_id is not null and r.manager_id = auth.uid() and v_sales_admin)
             or (r.manager_id is null and v_sales_admin)),
           r.created_at, count(*) over (),
           sp.name, sp.kind, sp.period,
           coalesce(h.subscription_price_minor, sp.price_minor),
           coalesce(h.subscription_currency::text, sp.currency::text),
           -- a request with no plan asks for the unlimited one, which is always available
           (r.subscription_plan_id is null or sp.status = 'active' or r.status <> 'pending')
      from public.hall_requests r
      left join public.profiles pr on pr.id = r.requested_by
      left join public.profiles pm on pm.id = r.manager_id
      left join public.halls h on h.id = r.hall_id
      left join public.subscription_plans sp on sp.id = coalesce(h.subscription_plan_id, r.subscription_plan_id)
     where (v_admin or r.requested_by = auth.uid() or r.manager_id = auth.uid() or (r.manager_id is null and v_sales_admin))
       and (p_status is null or r.status = p_status)
     order by (r.status = 'pending') desc, r.created_at desc, r.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- Pending requests of a manager who is no longer one go back to the shared sales-admin queue. (profiles.responsible_id
-- stays as the record of who created the account; new requests are routed by submit_hall_request below.)
create or replace function public.release_sales_manager(p_user_id uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.hall_requests set manager_id = null, updated_at = now()
   where manager_id = p_user_id and status = 'pending';
$$;
revoke execute on function public.release_sales_manager(uuid) from public, anon, authenticated;

create or replace function public.submit_hall_request(
  p_hall_name text, p_currency text, p_owner_email text, p_owner_username text, p_owner_password text,
  p_plan_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_id uuid; v_mgr uuid;
  v_email text := lower(btrim(coalesce(p_owner_email, '')));
  v_user text := lower(btrim(coalesce(p_owner_username, '')));
  v_name text := btrim(coalesce(p_hall_name, ''));
  v_cur text := upper(btrim(coalesce(p_currency, '')));
begin
  perform public.require_sales_user();
  if length(v_name) not between 1 and 120 then perform public.raise_contract_error('VALIDATION', 'hall_name'); end if;
  if v_cur not in ('SYP', 'USD') then perform public.raise_contract_error('VALIDATION', 'currency'); end if;
  if not public.valid_email(v_email) then perform public.raise_contract_error('VALIDATION', 'email'); end if;
  if v_user !~ '^[a-z0-9_]{3,20}$' then perform public.raise_contract_error('VALIDATION', 'username'); end if;
  if p_owner_password is null or length(p_owner_password) < 8 or length(p_owner_password) > 72 then
    perform public.raise_contract_error('VALIDATION', 'password');
  end if;
  if p_plan_id is not null and not exists (select 1 from public.subscription_plans where id = p_plan_id and status = 'active') then
    perform public.raise_contract_error('NOT_FOUND', 'plan');
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email)
     or exists (select 1 from public.hall_requests where status = 'pending' and owner_email = v_email) then
    perform public.raise_contract_error('CONFLICT', 'email_taken');
  end if;
  if exists (select 1 from public.profiles where username = v_user)
     or exists (select 1 from public.hall_requests where status = 'pending' and owner_username = v_user) then
    perform public.raise_contract_error('CONFLICT', 'username_taken');
  end if;

  select responsible_id into v_mgr from public.profiles where id = auth.uid();
  -- Route to the responsible person only while they are an active sales manager; otherwise to the shared queue.
  if v_mgr is not null and not exists (
       select 1 from public.user_role_assignments a join public.profiles p on p.id = a.user_id
        where a.user_id = v_mgr and a.role_key = 'sales_admin' and p.status = 'active') then
    v_mgr := null;
  end if;
  insert into public.hall_requests (requested_by, manager_id, hall_name, currency, owner_email, owner_username,
                                    owner_password_hash, subscription_plan_id)
  values (auth.uid(), v_mgr, v_name, v_cur, v_email, v_user, crypt(p_owner_password, gen_salt('bf')), p_plan_id)
  returning id into v_id;
  perform public.write_audit(null, 'sales.hall_request.submit', 'hall_request', v_id::text, null, null,
    jsonb_build_object('hall_name', v_name, 'owner_email', v_email, 'plan_id', p_plan_id));
  return v_id;
end $$;

create or replace function public.admin_revoke_platform_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_role not in ('super_admin', 'sales_admin', 'sales_agent') then perform public.raise_contract_error('VALIDATION', 'role'); end if;
  if not (public.has_platform_role('super_admin') or (p_role = 'sales_agent' and public.has_platform_role('sales_admin'))) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_role = 'super_admin' then
    if p_user_id = auth.uid() then perform public.raise_contract_error('PRECONDITION_FAILED', 'cannot_modify_self'); end if;
    if (select count(*) from public.user_role_assignments where role_key = 'super_admin') <= 1 then
      perform public.raise_contract_error('PRECONDITION_FAILED', 'last_super_admin');
    end if;
  end if;
  delete from public.user_role_assignments where user_id = p_user_id and role_key = p_role;
  if found then
    if p_role = 'sales_admin' then perform public.release_sales_manager(p_user_id); end if;
    perform public.write_audit(null, 'admin.role.revoke', 'user', p_user_id::text, null, jsonb_build_object('role', p_role), null);
  end if;
end $$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_p public.profiles; v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.require_super_admin();
  if p_status not in ('active', 'inactive') then perform public.raise_contract_error('VALIDATION', 'status'); end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  if p_user_id = auth.uid() then perform public.raise_contract_error('PRECONDITION_FAILED', 'cannot_modify_self'); end if;
  select * into v_p from public.profiles where id = p_user_id for update;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if v_p.status = p_status then return; end if;
  update public.profiles set status = p_status where id = p_user_id;
  -- Block sign-in and token refresh at the auth layer too, not only in the apps.
  update auth.users set banned_until = case when p_status = 'inactive' then now() + interval '100 years' end
   where id = p_user_id;
  if p_status = 'inactive' then perform public.release_sales_manager(p_user_id); end if;
  perform public.write_audit(null, 'admin.user.status', 'user', p_user_id::text, v_reason,
    jsonb_build_object('status', v_p.status), jsonb_build_object('status', p_status));
end $$;
