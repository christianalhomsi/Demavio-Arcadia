-- Products (catalog) and items sold during a session (reference feature "المنتجات", adapted to the plan).
--
-- What the reference did and what is different here:
--  * The reference app let the browser send the product name AND price when adding an item. Here the
--    database takes name and price from the catalog row at the moment of adding and stores them as a
--    snapshot on the item, so a client can never choose a price and later catalog edits never change
--    an existing line (spec §10.2: snapshots, integer minor units, no floating point).
--  * Catalog management is owner-only (`product.manage`); selling (`product.sell`) belongs to owners
--    and employees. The reference let staff manage the catalog; the plan keeps employees to day-to-day
--    operations (§4.2). Change the matrix in a new migration if the business decides otherwise.
--  * Items can be added or removed only while the session is live. The invoice is created when the
--    session ends and includes every non-removed item, one line each. After that the items are locked;
--    corrections are refunds or voids, never edits (financial history is append-only).
--  * Removing an item is a soft remove (who/when kept) and is written to the session history and the
--    audit log. Products are never deleted, only deactivated, so history keeps its references.
--
-- Concurrency: add/remove take a row lock on the session first, the same lock end_session takes, so an
-- item can never slip in after the invoice has been created.

set local search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (key, description) values
  ('product.manage', 'Create, edit and deactivate products'),
  ('product.sell',   'View products and add them to running sessions');
insert into public.role_permissions (role_key, permission_key) values
  ('owner', 'product.manage'),
  ('owner', 'product.sell'),
  ('employee', 'product.sell');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.products (
  id           uuid primary key default gen_random_uuid(),
  hall_id      uuid not null references public.halls (id),
  name         text not null check (length(btrim(name)) between 1 and 60),
  price_minor  bigint not null check (price_minor between 0 and 100000000),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index products_hall_name_idx on public.products (hall_id, lower(name));
create index products_hall_active_idx on public.products (hall_id, active);

create table public.session_items (
  id               uuid primary key default gen_random_uuid(),
  hall_id          uuid not null references public.halls (id),
  session_id       uuid not null references public.sessions (id),
  product_id       uuid references public.products (id),
  name             text not null,
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  quantity         int not null check (quantity between 1 and 99),
  added_by         uuid references public.profiles (id),
  idempotency_key  uuid,
  created_at       timestamptz not null default now(),
  removed_at       timestamptz,
  removed_by       uuid references public.profiles (id),
  check ((removed_at is null) = (removed_by is null))
);
create index session_items_session_idx on public.session_items (session_id) where removed_at is null;
create index session_items_hall_idx on public.session_items (hall_id, created_at desc);
create unique index session_items_idem_idx on public.session_items (added_by, idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- RLS: read-only for clients; every change goes through the RPCs below
-- ---------------------------------------------------------------------------

alter table public.products      enable row level security;
alter table public.session_items enable row level security;

create policy products_select on public.products
  for select to authenticated
  using (public.has_hall_permission(hall_id, 'product.sell') or public.has_hall_permission(hall_id, 'product.manage'));
create policy session_items_select on public.session_items
  for select to authenticated
  using (public.has_hall_permission(hall_id, 'product.sell') or public.has_hall_permission(hall_id, 'invoice.view'));

grant select on public.products, public.session_items to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.products, public.session_items;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Catalog RPCs
-- ---------------------------------------------------------------------------

create function public.upsert_product(
  p_hall_id uuid, p_id uuid, p_name text, p_price_minor bigint, p_active boolean
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_before public.products; v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.has_hall_permission(p_hall_id, 'product.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if length(v_name) < 1 or length(v_name) > 60 then
    perform public.raise_contract_error('VALIDATION', 'name');
  end if;
  if p_price_minor is null or p_price_minor < 0 or p_price_minor > 100000000 then
    perform public.raise_contract_error('VALIDATION', 'price');
  end if;

  begin
    if p_id is null then
      insert into public.products (hall_id, name, price_minor, active)
      values (p_hall_id, v_name, p_price_minor, coalesce(p_active, true))
      returning id into v_id;
      perform public.write_audit(p_hall_id, 'product.create', 'product', v_id::text, null, null,
        jsonb_build_object('name', v_name, 'price_minor', p_price_minor));
    else
      select * into v_before from public.products where id = p_id and hall_id = p_hall_id for update;
      if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
      update public.products
         set name = v_name, price_minor = p_price_minor, active = coalesce(p_active, active), updated_at = now()
       where id = p_id;
      v_id := p_id;
      perform public.write_audit(p_hall_id, 'product.update', 'product', v_id::text, null,
        jsonb_build_object('name', v_before.name, 'price_minor', v_before.price_minor, 'active', v_before.active),
        jsonb_build_object('name', v_name, 'price_minor', p_price_minor, 'active', coalesce(p_active, v_before.active)));
    end if;
  exception when unique_violation then
    perform public.raise_contract_error('CONFLICT', 'product_name_taken');
  end;
  return v_id;
end $$;

-- Managers see the whole catalog; sellers only the active products they can add.
create function public.list_products(p_hall_id uuid)
returns table (id uuid, name text, price_minor bigint, active boolean, currency char(3))
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_manage boolean;
begin
  v_manage := public.has_hall_permission(p_hall_id, 'product.manage');
  if not v_manage and not public.has_hall_permission(p_hall_id, 'product.sell') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select p.id, p.name, p.price_minor, p.active, h.currency
      from public.products p
      join public.halls h on h.id = p.hall_id
     where p.hall_id = p_hall_id and (v_manage or p.active)
     order by p.active desc, lower(p.name);
end $$;

-- ---------------------------------------------------------------------------
-- Session items
-- ---------------------------------------------------------------------------

create function public.add_session_item(p_session uuid, p_product uuid, p_quantity int, p_key uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.sessions; v_p public.products; v_id uuid; v_existing public.session_items;
begin
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 99 then
    perform public.raise_contract_error('VALIDATION', 'quantity');
  end if;

  -- Same lock end_session takes: an item cannot be added once the invoice exists.
  select * into v_s from public.sessions where id = p_session for update;
  if not found or not public.has_hall_permission(v_s.hall_id, 'product.sell') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;

  select * into v_existing from public.session_items where added_by = auth.uid() and idempotency_key = p_key;
  if found then
    if v_existing.session_id <> p_session or v_existing.product_id is distinct from p_product
       or v_existing.quantity <> p_quantity then
      perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch');
    end if;
    return v_existing.id;
  end if;

  if v_s.ended_at is not null or v_s.status not in ('starting', 'in_progress') then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'session_ended');
  end if;
  select * into v_p from public.products where id = p_product and hall_id = v_s.hall_id;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  if not v_p.active then perform public.raise_contract_error('PRECONDITION_FAILED', 'product_inactive'); end if;

  insert into public.session_items (hall_id, session_id, product_id, name, unit_price_minor, quantity, added_by, idempotency_key)
  values (v_s.hall_id, p_session, v_p.id, v_p.name, v_p.price_minor, p_quantity, auth.uid(), p_key)
  returning id into v_id;

  insert into public.session_events (session_id, hall_id, event_type, actor_id, detail)
  values (p_session, v_s.hall_id, 'item_added', auth.uid(),
          jsonb_build_object('item_id', v_id, 'name', v_p.name, 'quantity', p_quantity, 'unit_price_minor', v_p.price_minor));
  perform public.write_audit(v_s.hall_id, 'session.item.add', 'session', p_session::text, null, null,
    jsonb_build_object('item_id', v_id, 'product_id', v_p.id, 'quantity', p_quantity, 'unit_price_minor', v_p.price_minor));
  return v_id;
end $$;

create function public.remove_session_item(p_item uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_i public.session_items; v_s public.sessions;
begin
  select * into v_i from public.session_items where id = p_item;
  if not found then perform public.raise_contract_error('NOT_FOUND'); end if;
  select * into v_s from public.sessions where id = v_i.session_id for update;
  if not public.has_hall_permission(v_i.hall_id, 'product.sell') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  select * into v_i from public.session_items where id = p_item for update;
  if v_i.removed_at is not null then return; end if; -- retry-safe
  if v_s.ended_at is not null or v_s.status not in ('starting', 'in_progress') then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'session_ended');
  end if;

  update public.session_items set removed_at = now(), removed_by = auth.uid() where id = p_item;
  insert into public.session_events (session_id, hall_id, event_type, actor_id, detail)
  values (v_i.session_id, v_i.hall_id, 'item_removed', auth.uid(),
          jsonb_build_object('item_id', p_item, 'name', v_i.name, 'quantity', v_i.quantity));
  perform public.write_audit(v_i.hall_id, 'session.item.remove', 'session', v_i.session_id::text, null, null,
    jsonb_build_object('item_id', p_item, 'name', v_i.name, 'quantity', v_i.quantity));
end $$;

create function public.list_session_items(p_session uuid)
returns table (
  id uuid, product_id uuid, name text, unit_price_minor bigint, quantity int, line_minor bigint,
  currency char(3), added_by_name text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_hall uuid;
begin
  select s.hall_id into v_hall from public.sessions s where s.id = p_session;
  if v_hall is null
     or not (public.has_hall_permission(v_hall, 'product.sell') or public.has_hall_permission(v_hall, 'invoice.view')) then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select i.id, i.product_id, i.name, i.unit_price_minor, i.quantity, i.unit_price_minor * i.quantity,
           h.currency, coalesce(p.display_name, p.email), i.created_at
      from public.session_items i
      join public.halls h on h.id = i.hall_id
      left join public.profiles p on p.id = i.added_by
     where i.session_id = p_session and i.removed_at is null
     order by i.created_at, i.id;
end $$;

-- ---------------------------------------------------------------------------
-- Invoice: session time + one line per item (replaces the function from migration 7)
-- ---------------------------------------------------------------------------

create or replace function public.finalize_session_invoice(p_session uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.sessions; v_snap public.session_pricing_snapshots; v_id uuid; v_num int; v_charge record;
        v_items bigint; v_total bigint;
begin
  select * into v_s from public.sessions where id = p_session;
  if not found or v_s.ended_at is null then
    raise exception 'session not ended' using errcode = 'P0001';
  end if;
  select id into v_id from public.invoices where session_id = p_session;
  if found then return v_id; end if;

  select * into v_snap from public.session_pricing_snapshots where session_id = p_session;
  select * into v_charge from public.compute_session_charge(
    v_snap.rate_per_hour_minor, v_s.billable_seconds, v_snap.increment_minutes, v_snap.min_billable_minutes);
  select coalesce(sum(unit_price_minor * quantity), 0) into v_items
    from public.session_items where session_id = p_session and removed_at is null;
  v_total := v_charge.amount_minor + v_items;

  insert into public.invoice_counters (hall_id, last_number) values (v_s.hall_id, 1)
    on conflict (hall_id) do update set last_number = public.invoice_counters.last_number + 1
    returning last_number into v_num;

  insert into public.invoices
    (hall_id, session_id, number, customer_id, guest_name, currency, billable_seconds, billed_minutes,
     rate_per_hour_minor, total_minor, status)
  values (v_s.hall_id, p_session, 'INV-' || lpad(v_num::text, 6, '0'), v_s.customer_id, v_s.guest_name, v_snap.currency,
          v_s.billable_seconds, v_charge.billed_minutes, v_snap.rate_per_hour_minor, v_total,
          case when v_total = 0 then 'paid' else 'open' end)
  returning id into v_id;

  insert into public.invoice_items (invoice_id, hall_id, description, amount_minor, detail)
  values (v_id, v_s.hall_id, 'Gaming session', v_charge.amount_minor,
          jsonb_build_object('kind', 'session', 'billed_minutes', v_charge.billed_minutes,
                             'billable_seconds', v_s.billable_seconds,
                             'rate_per_hour_minor', v_snap.rate_per_hour_minor, 'rate_source', v_snap.rate_source));

  insert into public.invoice_items (invoice_id, hall_id, description, amount_minor, detail)
  select v_id, v_s.hall_id, i.name, i.unit_price_minor * i.quantity,
         jsonb_build_object('kind', 'product', 'product_id', i.product_id, 'quantity', i.quantity,
                            'unit_price_minor', i.unit_price_minor)
    from public.session_items i
   where i.session_id = p_session and i.removed_at is null
   order by i.created_at, i.id;

  insert into public.session_events (session_id, hall_id, event_type, actor_id, detail)
  values (p_session, v_s.hall_id, 'invoice_created', auth.uid(), jsonb_build_object('invoice_id', v_id));
  perform public.write_audit(v_s.hall_id, 'invoice.create', 'invoice', v_id::text, null, null,
    jsonb_build_object('session_id', p_session, 'total_minor', v_total, 'items_minor', v_items,
                       'currency', v_snap.currency));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Grants (internal finalize_session_invoice keeps its existing, non-client grants)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.upsert_product(uuid, uuid, text, bigint, boolean), public.list_products(uuid),
  public.add_session_item(uuid, uuid, int, uuid), public.remove_session_item(uuid),
  public.list_session_items(uuid)
  from public, anon, authenticated;
grant execute on function
  public.upsert_product(uuid, uuid, text, bigint, boolean), public.list_products(uuid),
  public.add_session_item(uuid, uuid, int, uuid), public.remove_session_item(uuid),
  public.list_session_items(uuid)
  to authenticated;
