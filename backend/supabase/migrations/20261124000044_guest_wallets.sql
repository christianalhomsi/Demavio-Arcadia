-- Wallets for players who have no account on the platform.
--
-- A guest wallet is owned by a name (and optionally a phone) typed by staff instead of a profile.
-- It works exactly like any wallet (top-up, pay an invoice, refunds). If the player registers later,
-- staff can attach the wallet to the new account with link_guest_wallet; nothing links automatically.

alter table public.wallets alter column customer_id drop not null;

alter table public.wallets
  add column guest_name  text check (guest_name  is null or length(btrim(guest_name))  between 1 and 80),
  add column guest_phone text check (guest_phone is null or length(btrim(guest_phone)) between 3 and 30),
  add constraint wallets_owner_check check (
    (customer_id is not null and guest_name is null and guest_phone is null)
    or (customer_id is null and guest_name is not null)
  );

-- One guest wallet per name + phone in a hall (names are compared case-insensitively).
create unique index wallets_guest_unique_idx
  on public.wallets (hall_id, lower(btrim(guest_name)), coalesce(btrim(guest_phone), ''))
  where customer_id is null;

-- ---------------------------------------------------------------------------
-- Open a guest wallet
-- ---------------------------------------------------------------------------
create function public.open_guest_wallet(p_hall_id uuid, p_name text, p_phone text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text := btrim(coalesce(p_name, '')); v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
        v_id uuid; v_cur char(3);
begin
  if not public.has_hall_permission(p_hall_id, 'wallet.top_up') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if length(v_name) < 1 or length(v_name) > 80 then perform public.raise_contract_error('VALIDATION', 'name'); end if;
  if v_phone is not null and (length(v_phone) < 3 or length(v_phone) > 30) then
    perform public.raise_contract_error('VALIDATION', 'phone');
  end if;
  select currency into v_cur from public.halls where id = p_hall_id;
  if v_cur is null then perform public.raise_contract_error('NOT_FOUND'); end if;

  -- Never silently reuse another guest's wallet: a clash is reported so staff add a phone number.
  if exists (
    select 1 from public.wallets w
     where w.hall_id = p_hall_id and w.customer_id is null
       and lower(btrim(w.guest_name)) = lower(v_name) and coalesce(btrim(w.guest_phone), '') = coalesce(v_phone, '')
  ) then
    perform public.raise_contract_error('CONFLICT', 'guest_exists');
  end if;

  insert into public.wallets (hall_id, customer_id, guest_name, guest_phone, currency)
  values (p_hall_id, null, v_name, v_phone, v_cur) returning id into v_id;

  perform public.write_audit(p_hall_id, 'wallet.open_guest', 'wallet', v_id::text, null, null,
    jsonb_build_object('guest_name', v_name, 'has_phone', v_phone is not null));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Attach a guest wallet to a registered player (manual, by email)
-- ---------------------------------------------------------------------------
create function public.link_guest_wallet(p_wallet_id uuid, p_customer_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_w public.wallets; v_cust uuid;
begin
  select * into v_w from public.wallets where id = p_wallet_id for update;
  if not found or not public.has_hall_permission(v_w.hall_id, 'wallet.top_up') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_w.customer_id is not null then perform public.raise_contract_error('PRECONDITION_FAILED', 'not_a_guest_wallet'); end if;

  select id into v_cust from public.profiles
   where lower(email) = lower(btrim(coalesce(p_customer_email, ''))) and status = 'active';
  if v_cust is null then perform public.raise_contract_error('NOT_FOUND'); end if;
  if exists (select 1 from public.wallets where hall_id = v_w.hall_id and customer_id = v_cust) then
    perform public.raise_contract_error('CONFLICT', 'customer_has_wallet');
  end if;

  update public.wallets set customer_id = v_cust, guest_name = null, guest_phone = null where id = v_w.id;
  perform public.write_audit(v_w.hall_id, 'wallet.link_guest', 'wallet', v_w.id::text, null,
    jsonb_build_object('guest_name', v_w.guest_name), jsonb_build_object('customer_id', v_cust));
end $$;

-- ---------------------------------------------------------------------------
-- A guest wallet can pay only invoices that have no registered customer (or belong to nobody)
-- ---------------------------------------------------------------------------
-- (pay_invoice_from_wallet compares invoice.customer_id <> wallet.customer_id; with a NULL wallet
-- owner that comparison is NULL and would let a guest wallet pay another customer's invoice.)
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.pay_invoice_from_wallet(uuid, uuid, bigint, uuid)'::regprocedure) into v_def;
  v_def := replace(v_def,
    'if v_i.customer_id is not null and v_i.customer_id <> v_w.customer_id then',
    'if v_i.customer_id is not null and v_i.customer_id is distinct from v_w.customer_id then');
  if v_def not like '%is distinct from v_w.customer_id%' then
    raise exception 'pay_invoice_from_wallet: expected owner check not found';
  end if;
  execute v_def;
end $$;

-- ---------------------------------------------------------------------------
-- Listing now includes guest wallets
-- ---------------------------------------------------------------------------
drop function public.list_wallets(uuid, text, int, int, uuid);
create function public.list_wallets(p_hall_id uuid, p_search text default null, p_limit int default 25, p_offset int default 0, p_wallet_id uuid default null)
returns table (id uuid, customer_name text, customer_email text, currency char(3), status text, balance_minor bigint,
               last_activity timestamptz, total bigint, guest_phone text, is_guest boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'wallet.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select w.id, coalesce(p.display_name, w.guest_name), p.email, w.currency, w.status, w.balance_minor,
           (select max(t.created_at) from public.wallet_transactions t where t.wallet_id = w.id), count(*) over (),
           w.guest_phone, (w.customer_id is null)
      from public.wallets w left join public.profiles p on p.id = w.customer_id
     where w.hall_id = p_hall_id and (p_wallet_id is null or w.id = p_wallet_id)
       and (p_search is null or p.display_name ilike '%' || p_search || '%' or p.email ilike '%' || p_search || '%'
            or w.guest_name ilike '%' || p_search || '%' or w.guest_phone ilike '%' || p_search || '%')
     order by coalesce(p.display_name, w.guest_name) nulls last, p.email
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

revoke execute on function
  public.open_guest_wallet(uuid, text, text), public.link_guest_wallet(uuid, text),
  public.list_wallets(uuid, text, int, int, uuid)
  from public, anon, authenticated;
grant execute on function
  public.open_guest_wallet(uuid, text, text), public.link_guest_wallet(uuid, text),
  public.list_wallets(uuid, text, int, int, uuid)
  to authenticated;
