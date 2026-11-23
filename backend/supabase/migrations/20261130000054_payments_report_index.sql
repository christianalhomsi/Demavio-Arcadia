-- Additive, behaviour-neutral: speeds the report queries that sum payments per hall over a date range
-- (shifts_registers_reports: where hall_id = $1 and method = ... and created_at >= from and < to).
-- Also covers the payments.hall_id foreign key. Plain CREATE INDEX (table is small and append-only);
-- for a very large production table run it manually with CONCURRENTLY instead.
create index if not exists payments_hall_created_idx on public.payments (hall_id, created_at);
