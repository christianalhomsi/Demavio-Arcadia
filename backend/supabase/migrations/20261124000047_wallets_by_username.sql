-- Staff find a registered player by username (not email) when opening or linking a wallet.
-- The email-based functions stay (other callers and tests use them); the web uses these.

create function public.open_wallet_by_username(p_hall_id uuid, p_username text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_cust uuid; v_id uuid; v_cur char(3);
begin
  if not public.has_hall_permission(p_hall_id, 'wallet.top_up') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  select id into v_cust from public.profiles
   where username = lower(btrim(coalesce(p_username, ''))) and status = 'active';
  if v_cust is null then perform public.raise_contract_error('NOT_FOUND'); end if;
  select currency into v_cur from public.halls where id = p_hall_id;

  insert into public.wallets (hall_id, customer_id, currency) values (p_hall_id, v_cust, v_cur)
    on conflict (hall_id, customer_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.wallets where hall_id = p_hall_id and customer_id = v_cust;
  else
    perform public.write_audit(p_hall_id, 'wallet.open', 'wallet', v_id::text, null, null,
      jsonb_build_object('customer_id', v_cust));
  end if;
  return v_id;
end $$;

create function public.link_guest_wallet_by_username(p_wallet_id uuid, p_username text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_w public.wallets; v_cust uuid;
begin
  select * into v_w from public.wallets where id = p_wallet_id for update;
  if not found or not public.has_hall_permission(v_w.hall_id, 'wallet.top_up') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_w.customer_id is not null then perform public.raise_contract_error('PRECONDITION_FAILED', 'not_a_guest_wallet'); end if;
  select id into v_cust from public.profiles
   where username = lower(btrim(coalesce(p_username, ''))) and status = 'active';
  if v_cust is null then perform public.raise_contract_error('NOT_FOUND'); end if;
  if exists (select 1 from public.wallets where hall_id = v_w.hall_id and customer_id = v_cust) then
    perform public.raise_contract_error('CONFLICT', 'customer_has_wallet');
  end if;
  update public.wallets set customer_id = v_cust, guest_name = null, guest_phone = null where id = v_w.id;
  perform public.write_audit(v_w.hall_id, 'wallet.link_guest', 'wallet', v_w.id::text, null,
    jsonb_build_object('guest_name', v_w.guest_name), jsonb_build_object('customer_id', v_cust));
end $$;

-- list_wallets also returns the username, and can be searched by it.
drop function public.list_wallets(uuid, text, int, int, uuid);
create function public.list_wallets(p_hall_id uuid, p_search text default null, p_limit int default 25, p_offset int default 0, p_wallet_id uuid default null)
returns table (id uuid, customer_name text, customer_email text, currency char(3), status text, balance_minor bigint,
               last_activity timestamptz, total bigint, guest_phone text, is_guest boolean, username text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'wallet.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select w.id, coalesce(p.display_name, w.guest_name), p.email, w.currency, w.status, w.balance_minor,
           (select max(t.created_at) from public.wallet_transactions t where t.wallet_id = w.id), count(*) over (),
           w.guest_phone, (w.customer_id is null), p.username
      from public.wallets w left join public.profiles p on p.id = w.customer_id
     where w.hall_id = p_hall_id and (p_wallet_id is null or w.id = p_wallet_id)
       and (p_search is null or p.display_name ilike '%' || p_search || '%' or p.email ilike '%' || p_search || '%'
            or p.username ilike '%' || p_search || '%'
            or w.guest_name ilike '%' || p_search || '%' or w.guest_phone ilike '%' || p_search || '%')
     order by coalesce(p.username, p.display_name, w.guest_name) nulls last, p.email
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

revoke execute on function
  public.open_wallet_by_username(uuid, text), public.link_guest_wallet_by_username(uuid, text),
  public.list_wallets(uuid, text, int, int, uuid)
  from public, anon, authenticated;
grant execute on function
  public.open_wallet_by_username(uuid, text), public.link_guest_wallet_by_username(uuid, text),
  public.list_wallets(uuid, text, int, int, uuid)
  to authenticated;
