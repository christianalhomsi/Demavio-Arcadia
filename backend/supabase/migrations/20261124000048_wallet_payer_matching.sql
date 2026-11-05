-- Paying from a wallet must use the wallet of the player on the invoice.
--
--  * A guest wallet is identified by a UNIQUE name in the hall (the phone is only extra info).
--  * resolve_player finds a registered player by username when a session starts.
--  * invoice_payer tells the payment screen who the invoice is for and which wallet is theirs (if any).
--  * pay_invoice_from_wallet refuses a wallet that is not the invoice player's.
--  * set_invoice_payer lets staff fix a wrong name on an unpaid invoice.

drop index public.wallets_guest_unique_idx;
create unique index wallets_guest_name_unique_idx
  on public.wallets (hall_id, lower(btrim(guest_name))) where customer_id is null;

create or replace function public.open_guest_wallet(p_hall_id uuid, p_name text, p_phone text default null) returns uuid
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
  if exists (select 1 from public.wallets w
              where w.hall_id = p_hall_id and w.customer_id is null and lower(btrim(w.guest_name)) = lower(v_name)) then
    perform public.raise_contract_error('CONFLICT', 'guest_exists');
  end if;
  insert into public.wallets (hall_id, customer_id, guest_name, guest_phone, currency)
  values (p_hall_id, null, v_name, v_phone, v_cur) returning id into v_id;
  perform public.write_audit(p_hall_id, 'wallet.open_guest', 'wallet', v_id::text, null, null,
    jsonb_build_object('guest_name', v_name, 'has_phone', v_phone is not null));
  return v_id;
end $$;

create function public.resolve_player(p_hall_id uuid, p_username text) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not public.has_hall_permission(p_hall_id, 'session.start') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  select id into v_id from public.profiles
   where username = lower(btrim(coalesce(p_username, ''))) and status = 'active';
  if v_id is null then perform public.raise_contract_error('NOT_FOUND'); end if;
  return v_id;
end $$;

create function public.invoice_payer(p_invoice_id uuid)
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
    return query select coalesce('@' || v_p.username, v_p.display_name, v_p.email), false, v_w;
  else
    select id into v_w from public.wallets
     where hall_id = v_i.hall_id and customer_id is null and lower(btrim(guest_name)) = lower(btrim(coalesce(v_i.guest_name, '')));
    return query select v_i.guest_name, true, v_w;
  end if;
end $$;

-- Wallet payments: the wallet must belong to the invoice's player.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.pay_invoice_from_wallet(uuid, uuid, bigint, uuid)'::regprocedure) into v_def;
  v_def := replace(v_def,
    'if v_i.customer_id is not null and v_i.customer_id is distinct from v_w.customer_id then',
    'if (v_i.customer_id is not null and v_i.customer_id is distinct from v_w.customer_id)
       or (v_i.customer_id is null and v_i.guest_name is not null
           and (v_w.customer_id is not null or lower(btrim(v_w.guest_name)) <> lower(btrim(v_i.guest_name)))) then');
  if v_def not like '%lower(btrim(v_i.guest_name))%' then
    raise exception 'pay_invoice_from_wallet: expected owner check not found';
  end if;
  execute v_def;
end $$;

-- Fix who the invoice is for (a username for a registered player, or a guest name). Only while no wallet
-- payment has been taken, so a payment can never end up under a different player.
create function public.set_invoice_payer(p_invoice_id uuid, p_username text, p_guest_name text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_i public.invoices; v_cust uuid; v_guest text := nullif(btrim(coalesce(p_guest_name, '')), '');
begin
  select * into v_i from public.invoices where id = p_invoice_id for update;
  if not found or not public.has_hall_permission(v_i.hall_id, 'payment.collect') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_i.status not in ('open', 'partially_paid')
     or exists (select 1 from public.payments where invoice_id = v_i.id and method = 'wallet') then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'invoice_not_adjustable');
  end if;
  if nullif(btrim(coalesce(p_username, '')), '') is not null then
    select id into v_cust from public.profiles
     where username = lower(btrim(p_username)) and status = 'active';
    if v_cust is null then perform public.raise_contract_error('NOT_FOUND'); end if;
    v_guest := null;
  elsif v_guest is null or length(v_guest) > 80 then
    perform public.raise_contract_error('VALIDATION', 'name');
  end if;
  update public.invoices set customer_id = v_cust, guest_name = v_guest where id = v_i.id;
  perform public.write_audit(v_i.hall_id, 'invoice.payer_change', 'invoice', v_i.id::text, null,
    jsonb_build_object('customer_id', v_i.customer_id, 'guest_name', v_i.guest_name),
    jsonb_build_object('customer_id', v_cust, 'guest_name', v_guest));
end $$;

revoke execute on function
  public.resolve_player(uuid, text), public.invoice_payer(uuid), public.set_invoice_payer(uuid, text, text),
  public.open_guest_wallet(uuid, text, text)
  from public, anon, authenticated;
grant execute on function
  public.resolve_player(uuid, text), public.invoice_payer(uuid), public.set_invoice_payer(uuid, text, text),
  public.open_guest_wallet(uuid, text, text)
  to authenticated;
