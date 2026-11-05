-- Expenses with receipts and advanced report breakdowns (plan ACC-006, ACC-008).
--
-- Decisions (DEC-P18..P20):
--  * Expenses are owner-only (`expense.manage`). They are a record of money the hall spent. They do NOT
--    touch the cash drawer or shift counts; cash taken from a drawer is still a shift payout.
--  * An expense is never deleted. It can be corrected (audited with before/after) or voided with a reason.
--  * Receipts live in a private Storage bucket, one folder per hall and expense. Only people who may
--    manage that hall's expenses can read or upload them; the web shows short-lived signed links.
--  * The breakdown report returns every figure from the database. The web only draws bars.

set local search_path = public, extensions;

insert into public.permissions (key, description) values
  ('expense.manage', 'Record, correct and void hall expenses and their receipts');
insert into public.role_permissions (role_key, permission_key) values
  ('owner', 'expense.manage');

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.expenses (
  id              uuid primary key default gen_random_uuid(),
  hall_id         uuid not null references public.halls (id),
  category        text not null check (category in ('rent', 'electricity', 'internet', 'supplies', 'salaries', 'maintenance', 'other')),
  amount_minor    bigint not null check (amount_minor between 1 and 100000000000),
  currency        char(3) not null,
  spent_on        date not null,
  paid_with       text not null check (paid_with in ('cash', 'bank', 'other')),
  description     text check (description is null or length(description) <= 300),
  receipt_path    text check (receipt_path is null or length(receipt_path) <= 300),
  status          text not null default 'recorded' check (status in ('recorded', 'voided')),
  void_reason     text,
  voided_by       uuid references public.profiles (id),
  voided_at       timestamptz,
  created_by      uuid references public.profiles (id),
  idempotency_key uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((status = 'voided') = (voided_at is not null))
);
create index expenses_hall_idx on public.expenses (hall_id, spent_on desc);
create unique index expenses_idem_idx on public.expenses (created_by, idempotency_key) where idempotency_key is not null;

alter table public.expenses enable row level security;
create policy expenses_select on public.expenses for select to authenticated
  using (public.has_hall_permission(hall_id, 'expense.manage'));
grant select on public.expenses to authenticated;

-- ---------------------------------------------------------------------------
-- Receipts: private bucket + policies (only where Supabase Storage exists)
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do nothing;

    execute $p$create policy receipts_select on storage.objects for select to authenticated
      using (bucket_id = 'receipts' and public.has_hall_permission(((storage.foldername(name))[1])::uuid, 'expense.manage'))$p$;
    execute $p$create policy receipts_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'receipts' and public.has_hall_permission(((storage.foldername(name))[1])::uuid, 'expense.manage'))$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.create_expense(
  p_hall_id uuid, p_category text, p_amount_minor bigint, p_spent_on date, p_paid_with text, p_description text, p_key uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_cur char(3); v_existing public.expenses; v_desc text := nullif(btrim(p_description), '');
begin
  if not public.has_hall_permission(p_hall_id, 'expense.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_key is null then perform public.raise_contract_error('VALIDATION', 'idempotency_key'); end if;
  select * into v_existing from public.expenses where created_by = auth.uid() and idempotency_key = p_key;
  if found then
    if v_existing.hall_id <> p_hall_id or v_existing.amount_minor <> p_amount_minor then
      perform public.raise_contract_error('CONFLICT', 'idempotency_mismatch');
    end if;
    return v_existing.id;
  end if;

  if p_category is null or p_category not in ('rent', 'electricity', 'internet', 'supplies', 'salaries', 'maintenance', 'other') then
    perform public.raise_contract_error('VALIDATION', 'category');
  end if;
  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 100000000000 then
    perform public.raise_contract_error('VALIDATION', 'amount');
  end if;
  if p_spent_on is null or p_spent_on > current_date + 1 or p_spent_on < current_date - 3660 then
    perform public.raise_contract_error('VALIDATION', 'spent_on');
  end if;
  if p_paid_with is null or p_paid_with not in ('cash', 'bank', 'other') then
    perform public.raise_contract_error('VALIDATION', 'paid_with');
  end if;
  if v_desc is not null and length(v_desc) > 300 then perform public.raise_contract_error('VALIDATION', 'description'); end if;

  select currency into v_cur from public.halls where id = p_hall_id;
  insert into public.expenses (hall_id, category, amount_minor, currency, spent_on, paid_with, description, created_by, idempotency_key)
  values (p_hall_id, p_category, p_amount_minor, v_cur, p_spent_on, p_paid_with, v_desc, auth.uid(), p_key)
  returning id into v_id;
  perform public.write_audit(p_hall_id, 'expense.create', 'expense', v_id::text, null, null,
    jsonb_build_object('category', p_category, 'amount_minor', p_amount_minor, 'currency', v_cur, 'spent_on', p_spent_on));
  return v_id;
end $$;

create function public.update_expense(
  p_id uuid, p_category text, p_amount_minor bigint, p_spent_on date, p_paid_with text, p_description text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_e public.expenses; v_desc text := nullif(btrim(p_description), '');
begin
  select * into v_e from public.expenses where id = p_id for update;
  if not found or not public.has_hall_permission(v_e.hall_id, 'expense.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_e.status = 'voided' then perform public.raise_contract_error('PRECONDITION_FAILED', 'expense_voided'); end if;
  if p_category is null or p_category not in ('rent', 'electricity', 'internet', 'supplies', 'salaries', 'maintenance', 'other') then
    perform public.raise_contract_error('VALIDATION', 'category');
  end if;
  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > 100000000000 then
    perform public.raise_contract_error('VALIDATION', 'amount');
  end if;
  if p_spent_on is null or p_spent_on > current_date + 1 or p_spent_on < current_date - 3660 then
    perform public.raise_contract_error('VALIDATION', 'spent_on');
  end if;
  if p_paid_with is null or p_paid_with not in ('cash', 'bank', 'other') then
    perform public.raise_contract_error('VALIDATION', 'paid_with');
  end if;
  if v_desc is not null and length(v_desc) > 300 then perform public.raise_contract_error('VALIDATION', 'description'); end if;

  update public.expenses
     set category = p_category, amount_minor = p_amount_minor, spent_on = p_spent_on, paid_with = p_paid_with,
         description = v_desc, updated_at = now()
   where id = p_id;
  perform public.write_audit(v_e.hall_id, 'expense.update', 'expense', p_id::text, null,
    jsonb_build_object('category', v_e.category, 'amount_minor', v_e.amount_minor, 'spent_on', v_e.spent_on, 'paid_with', v_e.paid_with),
    jsonb_build_object('category', p_category, 'amount_minor', p_amount_minor, 'spent_on', p_spent_on, 'paid_with', p_paid_with));
end $$;

create function public.void_expense(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_e public.expenses; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_e from public.expenses where id = p_id for update;
  if not found or not public.has_hall_permission(v_e.hall_id, 'expense.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
  if v_e.status = 'voided' then return; end if;
  update public.expenses set status = 'voided', void_reason = v_reason, voided_by = auth.uid(), voided_at = now(), updated_at = now()
   where id = p_id;
  perform public.write_audit(v_e.hall_id, 'expense.void', 'expense', p_id::text, v_reason,
    jsonb_build_object('amount_minor', v_e.amount_minor), null);
end $$;

-- The path must live in this expense's own folder: <hall>/<expense>/<file>.
create function public.attach_expense_receipt(p_id uuid, p_path text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_e public.expenses;
begin
  select * into v_e from public.expenses where id = p_id for update;
  if not found or not public.has_hall_permission(v_e.hall_id, 'expense.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_e.status = 'voided' then perform public.raise_contract_error('PRECONDITION_FAILED', 'expense_voided'); end if;
  if p_path is null or length(p_path) > 300
     or p_path !~ ('^' || v_e.hall_id::text || '/' || v_e.id::text || '/[A-Za-z0-9._-]+$') then
    perform public.raise_contract_error('VALIDATION', 'receipt');
  end if;
  update public.expenses set receipt_path = p_path, updated_at = now() where id = p_id;
  perform public.write_audit(v_e.hall_id, 'expense.receipt', 'expense', p_id::text, null,
    jsonb_build_object('receipt_path', v_e.receipt_path), jsonb_build_object('receipt_path', p_path));
end $$;

create function public.get_expense_receipt_path(p_id uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_e public.expenses;
begin
  select * into v_e from public.expenses where id = p_id;
  if not found or not public.has_hall_permission(v_e.hall_id, 'expense.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return v_e.receipt_path;
end $$;

create function public.list_expenses(
  p_hall_id uuid, p_from date default null, p_to date default null, p_category text default null,
  p_limit int default 25, p_offset int default 0
) returns table (
  id uuid, category text, amount_minor bigint, currency char(3), spent_on date, paid_with text, description text,
  has_receipt boolean, status text, void_reason text, created_by_name text, created_at timestamptz,
  total bigint, total_amount_minor bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.has_hall_permission(p_hall_id, 'expense.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  return query
    select e.id, e.category, e.amount_minor, e.currency, e.spent_on, e.paid_with, e.description,
           e.receipt_path is not null, e.status, e.void_reason, coalesce(p.display_name, p.email), e.created_at,
           count(*) over (),
           coalesce(sum(e.amount_minor) filter (where e.status = 'recorded') over (), 0)::bigint
      from public.expenses e left join public.profiles p on p.id = e.created_by
     where e.hall_id = p_hall_id
       and (p_from is null or e.spent_on >= p_from) and (p_to is null or e.spent_on <= p_to)
       and (p_category is null or e.category = p_category)
     order by e.spent_on desc, e.created_at desc, e.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Report breakdown (advanced reports): every row is computed here.
-- dimension: device | device_category | employee | day | product | discount_employee | expense_category | total
-- ---------------------------------------------------------------------------

create function public.report_breakdown(p_hall_id uuid, p_from timestamptz, p_to timestamptz)
returns table (dimension text, key text, label text, item_count bigint, amount_minor bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_tz text;
begin
  if not public.has_hall_permission(p_hall_id, 'report.financial.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days' then
    perform public.raise_contract_error('VALIDATION', 'period');
  end if;
  select time_zone into v_tz from public.halls where id = p_hall_id;

  return query
    -- Billed amount per device and per device category (non-voided invoices created in the period).
    select 'device'::text, d.id::text, d.name, count(*), coalesce(sum(i.total_minor), 0)::bigint
      from public.invoices i join public.sessions s on s.id = i.session_id join public.devices d on d.id = s.device_id
     where i.hall_id = p_hall_id and i.status <> 'voided' and i.created_at >= p_from and i.created_at < p_to
     group by d.id, d.name
    union all
    select 'device_category', lower(coalesce(d.category, '')), coalesce(d.category, ''), count(*), coalesce(sum(i.total_minor), 0)::bigint
      from public.invoices i join public.sessions s on s.id = i.session_id join public.devices d on d.id = s.device_id
     where i.hall_id = p_hall_id and i.status <> 'voided' and i.created_at >= p_from and i.created_at < p_to
     group by lower(coalesce(d.category, '')), coalesce(d.category, '')
    union all
    -- Collections per employee.
    select 'employee', pay.created_by::text, coalesce(pr.display_name, pr.email, ''), count(*), coalesce(sum(pay.amount_minor), 0)::bigint
      from public.payments pay left join public.profiles pr on pr.id = pay.created_by
     where pay.hall_id = p_hall_id and pay.created_at >= p_from and pay.created_at < p_to
     group by pay.created_by, coalesce(pr.display_name, pr.email, '')
    union all
    -- Billed amount per day in the hall's time zone.
    select 'day', to_char((i.created_at at time zone v_tz)::date, 'YYYY-MM-DD'), to_char((i.created_at at time zone v_tz)::date, 'YYYY-MM-DD'),
           count(*), coalesce(sum(i.total_minor), 0)::bigint
      from public.invoices i
     where i.hall_id = p_hall_id and i.status <> 'voided' and i.created_at >= p_from and i.created_at < p_to
     group by (i.created_at at time zone v_tz)::date
    union all
    -- Product sales (invoice lines of kind product).
    select 'product', lower(it.description), it.description, coalesce(sum((it.detail ->> 'quantity')::bigint), 0)::bigint, coalesce(sum(it.amount_minor), 0)::bigint
      from public.invoice_items it join public.invoices i on i.id = it.invoice_id
     where i.hall_id = p_hall_id and i.status <> 'voided' and it.detail ->> 'kind' = 'product'
       and i.created_at >= p_from and i.created_at < p_to
     group by lower(it.description), it.description
    union all
    -- Discounts given, per employee.
    select 'discount_employee', x.applied_by::text, coalesce(pr.display_name, pr.email, ''), count(*), coalesce(sum(x.amount_minor), 0)::bigint
      from public.invoice_discounts x left join public.profiles pr on pr.id = x.applied_by
     where x.hall_id = p_hall_id and x.created_at >= p_from and x.created_at < p_to
     group by x.applied_by, coalesce(pr.display_name, pr.email, '')
    union all
    -- Expenses per category (recorded only).
    select 'expense_category', e.category, e.category, count(*), coalesce(sum(e.amount_minor), 0)::bigint
      from public.expenses e
     where e.hall_id = p_hall_id and e.status = 'recorded'
       and e.spent_on >= (p_from at time zone v_tz)::date and e.spent_on < (p_to at time zone v_tz)::date
     group by e.category
    union all
    -- Totals that sit outside the summary report.
    select 'total', 'expenses', 'expenses', count(*), coalesce(sum(e.amount_minor), 0)::bigint
      from public.expenses e
     where e.hall_id = p_hall_id and e.status = 'recorded'
       and e.spent_on >= (p_from at time zone v_tz)::date and e.spent_on < (p_to at time zone v_tz)::date
    union all
    select 'total', 'discounts', 'discounts', count(*), coalesce(sum(x.amount_minor), 0)::bigint
      from public.invoice_discounts x
     where x.hall_id = p_hall_id and x.created_at >= p_from and x.created_at < p_to
    union all
    select 'total', 'write_offs', 'write_offs', count(*), coalesce(sum(a.amount_minor), 0)::bigint
      from public.invoice_adjustments a
     where a.hall_id = p_hall_id and a.created_at >= p_from and a.created_at < p_to;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  public.create_expense(uuid, text, bigint, date, text, text, uuid),
  public.update_expense(uuid, text, bigint, date, text, text),
  public.void_expense(uuid, text),
  public.attach_expense_receipt(uuid, text),
  public.get_expense_receipt_path(uuid),
  public.list_expenses(uuid, date, date, text, int, int),
  public.report_breakdown(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function
  public.create_expense(uuid, text, bigint, date, text, text, uuid),
  public.update_expense(uuid, text, bigint, date, text, text),
  public.void_expense(uuid, text),
  public.attach_expense_receipt(uuid, text),
  public.get_expense_receipt_path(uuid),
  public.list_expenses(uuid, date, date, text, int, int),
  public.report_breakdown(uuid, timestamptz, timestamptz)
  to authenticated;
