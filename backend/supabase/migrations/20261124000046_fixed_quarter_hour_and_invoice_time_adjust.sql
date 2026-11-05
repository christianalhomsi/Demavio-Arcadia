-- Time on an invoice is counted in quarter hours, for every hall.
--
-- 1. The billing step is fixed at 15 minutes and the minimum charge is gone. Existing halls are updated;
--    sessions already running keep the rules they started with (their pricing snapshot).
-- 2. When a session ends, the invoice rounds the time UP to the next quarter hour (as before, with a
--    15-minute step). The hall owner can then change how the time is charged on that invoice:
--    round up, round down, or enter their own price for the time. See adjust_invoice_time.

update public.hall_settings set billing_increment_minutes = 15, min_billable_minutes = 0;
alter table public.hall_settings alter column billing_increment_minutes set default 15;

-- ---------------------------------------------------------------------------
-- Time charge for a finished session in a chosen rounding mode ('up' | 'down')
-- ---------------------------------------------------------------------------
create function public.compute_time_charge(p_session uuid, p_mode text)
returns table (billed_min int, amount bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_s public.sessions; v_snap public.session_pricing_snapshots; v_min int;
begin
  select * into v_s from public.sessions where id = p_session;
  select * into v_snap from public.session_pricing_snapshots where session_id = p_session;
  if v_s.id is null or v_snap.session_id is null or v_s.ended_at is null then
    perform public.raise_contract_error('NOT_FOUND');
  end if;
  if p_mode = 'up' then
    select c.billed_minutes into v_min from public.compute_session_charge(
      v_snap.rate_per_hour_minor, v_s.billable_seconds, v_snap.increment_minutes, v_snap.min_billable_minutes) c;
  elsif p_mode = 'down' then
    v_min := ((coalesce(v_s.billable_seconds, 0) / 60) / v_snap.increment_minutes) * v_snap.increment_minutes;
  else
    perform public.raise_contract_error('VALIDATION', 'mode');
  end if;
  return query
    select v_min, coalesce(sum(g.amount_minor), 0)::bigint
      from public.compute_segments(v_s.started_at, v_min, v_snap.rate_per_hour_minor, v_snap.windows, v_snap.time_zone) g;
end $$;

-- ---------------------------------------------------------------------------
-- What the owner can choose on an invoice (read-only preview)
-- ---------------------------------------------------------------------------
create function public.invoice_time_options(p_invoice_id uuid)
returns table (played_seconds int, up_minutes int, up_minor bigint, down_minutes int, down_minor bigint,
               current_minor bigint, adjustable boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_i public.invoices; v_up record; v_down record; v_cur bigint; v_ok boolean;
begin
  select * into v_i from public.invoices where id = p_invoice_id;
  if not found or not public.has_hall_permission(v_i.hall_id, 'invoice.view') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  select * into v_up   from public.compute_time_charge(v_i.session_id, 'up');
  select * into v_down from public.compute_time_charge(v_i.session_id, 'down');
  select coalesce(sum(amount_minor), 0) into v_cur
    from public.invoice_items where invoice_id = v_i.id and detail ->> 'kind' = 'session';
  v_ok := v_i.status = 'open' and v_i.paid_minor = 0
          and not exists (select 1 from public.invoice_items
                           where invoice_id = v_i.id and detail ->> 'kind' in ('discount', 'write_off', 'package'));
  return query select v_i.billable_seconds, v_up.billed_min, v_up.amount, v_down.billed_min, v_down.amount, v_cur, v_ok;
end $$;

-- ---------------------------------------------------------------------------
-- Change how the time on an unpaid invoice is charged
-- ---------------------------------------------------------------------------
-- 'up' / 'down' recompute the time from what was actually played; 'custom' sets the time charge to the
-- amount the owner typed (a reason is required). Products on the invoice are untouched. Only an open
-- invoice with no payment, discount, write-off or package can change, so the numbers stay consistent.
create function public.adjust_invoice_time(p_invoice_id uuid, p_mode text, p_amount_minor bigint, p_reason text)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_i public.invoices; v_s public.sessions; v_snap public.session_pricing_snapshots; v_seg record;
        v_min int; v_time bigint; v_total bigint; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_i from public.invoices where id = p_invoice_id for update;
  if not found or not public.has_hall_permission(v_i.hall_id, 'payment.adjust') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_mode not in ('up', 'down', 'custom') then perform public.raise_contract_error('VALIDATION', 'mode'); end if;
  if v_i.status <> 'open' or v_i.paid_minor > 0
     or exists (select 1 from public.invoice_items
                 where invoice_id = v_i.id and detail ->> 'kind' in ('discount', 'write_off', 'package')) then
    perform public.raise_contract_error('PRECONDITION_FAILED', 'invoice_not_adjustable');
  end if;

  select * into v_s from public.sessions where id = v_i.session_id;
  select * into v_snap from public.session_pricing_snapshots where session_id = v_i.session_id;

  if p_mode = 'custom' then
    if p_amount_minor is null or p_amount_minor < 0 then perform public.raise_contract_error('VALIDATION', 'amount'); end if;
    if length(v_reason) < 3 or length(v_reason) > 300 then perform public.raise_contract_error('VALIDATION', 'reason'); end if;
    v_time := p_amount_minor;
    v_min := v_i.billed_minutes;
  else
    select c.billed_min, c.amount into v_min, v_time from public.compute_time_charge(v_s.id, p_mode) c;
  end if;

  delete from public.invoice_items where invoice_id = v_i.id and detail ->> 'kind' = 'session';

  if p_mode = 'custom' then
    insert into public.invoice_items (invoice_id, hall_id, description, amount_minor, detail)
    values (v_i.id, v_i.hall_id, 'Gaming session', v_time,
            jsonb_build_object('kind', 'session', 'billed_minutes', v_min, 'billable_seconds', v_s.billable_seconds,
                               'rate_per_hour_minor', v_snap.rate_per_hour_minor, 'rate_source', v_snap.rate_source,
                               'custom', true));
  else
    for v_seg in select * from public.compute_segments(
        v_s.started_at, v_min, v_snap.rate_per_hour_minor, v_snap.windows, v_snap.time_zone) loop
      insert into public.invoice_items (invoice_id, hall_id, description, amount_minor, detail)
      values (v_i.id, v_i.hall_id, 'Gaming session', v_seg.amount_minor,
              jsonb_build_object('kind', 'session', 'billed_minutes', v_seg.minutes,
                                 'billable_seconds', v_s.billable_seconds,
                                 'rate_per_hour_minor', v_seg.rate_per_hour_minor, 'rate_source', v_snap.rate_source,
                                 'rounding', p_mode));
    end loop;
    if v_min = 0 then
      insert into public.invoice_items (invoice_id, hall_id, description, amount_minor, detail)
      values (v_i.id, v_i.hall_id, 'Gaming session', 0,
              jsonb_build_object('kind', 'session', 'billed_minutes', 0, 'billable_seconds', v_s.billable_seconds,
                                 'rate_per_hour_minor', v_snap.rate_per_hour_minor, 'rate_source', v_snap.rate_source,
                                 'rounding', p_mode));
    end if;
  end if;

  select coalesce(sum(amount_minor), 0) into v_total from public.invoice_items where invoice_id = v_i.id;
  update public.invoices
     set billed_minutes = v_min, total_minor = v_total, status = case when v_total = 0 then 'paid' else 'open' end
   where id = v_i.id;

  perform public.write_audit(v_i.hall_id, 'invoice.time_adjust', 'invoice', v_i.id::text, nullif(v_reason, ''),
    jsonb_build_object('total_minor', v_i.total_minor, 'billed_minutes', v_i.billed_minutes),
    jsonb_build_object('total_minor', v_total, 'billed_minutes', v_min, 'mode', p_mode));
  return v_total;
end $$;

revoke execute on function
  public.compute_time_charge(uuid, text), public.invoice_time_options(uuid),
  public.adjust_invoice_time(uuid, text, bigint, text)
  from public, anon, authenticated;
grant execute on function
  public.invoice_time_options(uuid), public.adjust_invoice_time(uuid, text, bigint, text)
  to authenticated;
