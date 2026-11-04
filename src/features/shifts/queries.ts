import "server-only";
import { createClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;

/** Every amount here is computed by the database. The web only displays and compares them. */
export interface ShiftRow {
  id: string;
  registerId: string;
  registerName: string;
  status: "open" | "closed";
  currency: string;
  openedByName: string | null;
  openedAt: string;
  openingCashMinor: number;
  closedByName: string | null;
  closedAt: string | null;
  countedCashMinor: number | null;
  expectedCashMinor: number;
  differenceMinor: number | null;
  overrideReason: string | null;
  unpaidCount: number | null;
  unpaidMinor: number | null;
  cashPaymentsMinor: number;
  topUpsMinor: number;
  cashRefundsMinor: number;
  payoutsMinor: number;
  adjustmentsMinor: number;
  activeSessions: number;
}

const nullableNumber = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const toShift = (r: Row): ShiftRow => ({
  id: r.id as string,
  registerId: r.register_id as string,
  registerName: r.register_name as string,
  status: r.status as ShiftRow["status"],
  currency: (r.currency as string).trim(),
  openedByName: (r.opened_by_name as string | null) ?? null,
  openedAt: r.opened_at as string,
  openingCashMinor: Number(r.opening_cash_minor),
  closedByName: (r.closed_by_name as string | null) ?? null,
  closedAt: (r.closed_at as string | null) ?? null,
  countedCashMinor: nullableNumber(r.counted_cash_minor),
  expectedCashMinor: Number(r.expected_cash_minor),
  differenceMinor: nullableNumber(r.difference_minor),
  overrideReason: (r.override_reason as string | null) ?? null,
  unpaidCount: nullableNumber(r.unpaid_count),
  unpaidMinor: nullableNumber(r.unpaid_minor),
  cashPaymentsMinor: Number(r.cash_payments_minor),
  topUpsMinor: Number(r.top_ups_minor),
  cashRefundsMinor: Number(r.cash_refunds_minor),
  payoutsMinor: Number(r.payouts_minor),
  adjustmentsMinor: Number(r.adjustments_minor),
  activeSessions: Number(r.active_sessions),
});

export async function listShifts(
  hallId: string,
  opts: { limit: number; offset: number; status?: "open" | "closed"; shiftId?: string },
): Promise<{ rows: ShiftRow[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_shifts", {
    p_hall_id: hallId,
    p_status: opts.status ?? null,
    p_limit: opts.limit,
    p_offset: opts.offset,
    p_shift_id: opts.shiftId ?? null,
  });
  if (error) return null;
  const rows = (data ?? []) as Row[];
  return { total: rows[0] ? Number(rows[0].total) : 0, rows: rows.map(toShift) };
}

export async function getShift(hallId: string, shiftId: string): Promise<ShiftRow | null> {
  const page = await listShifts(hallId, { limit: 1, offset: 0, shiftId });
  return page?.rows[0] ?? null;
}

export interface UnpaidInvoiceRow {
  invoiceId: string;
  number: string;
  sessionId: string;
  deviceName: string;
  customerName: string | null;
  endedAt: string | null;
  totalMinor: number;
  outstandingMinor: number;
  currency: string;
  status: string;
  /** Created since the shift opened: blocks closing. Older ones are shown for visibility only. */
  inShift: boolean;
}

/** Needs shift.close; returns null if the call is refused or fails. */
export async function getShiftUnpaidSummary(shiftId: string): Promise<UnpaidInvoiceRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shift_unpaid_summary", { p_shift_id: shiftId });
  if (error) return null;
  return ((data ?? []) as Row[]).map((r) => ({
    invoiceId: r.invoice_id as string,
    number: r.number as string,
    sessionId: r.session_id as string,
    deviceName: r.device_name as string,
    customerName: (r.customer_name as string | null) ?? null,
    endedAt: (r.ended_at as string | null) ?? null,
    totalMinor: Number(r.total_minor),
    outstandingMinor: Number(r.outstanding_minor),
    currency: (r.currency as string).trim(),
    status: r.status as string,
    inShift: Boolean(r.in_shift),
  }));
}

export type CashMovementKind =
  "cash_payment" | "wallet_top_up" | "cash_refund" | "payout" | "adjustment_in" | "adjustment_out";

export interface CashMovementRow {
  id: string;
  shiftId: string;
  kind: CashMovementKind;
  /** Signed: positive goes into the drawer, negative comes out. */
  amountMinor: number;
  currency: string;
  reason: string | null;
  invoiceNumber: string | null;
  actorName: string | null;
  createdAt: string;
}

export async function listCashMovements(
  hallId: string,
  opts: { limit: number; offset: number; shiftId?: string },
): Promise<{ rows: CashMovementRow[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_cash_movements", {
    p_hall_id: hallId,
    p_shift_id: opts.shiftId ?? null,
    p_limit: opts.limit,
    p_offset: opts.offset,
  });
  if (error) return null;
  const rows = (data ?? []) as Row[];
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    rows: rows.map((r) => ({
      id: r.id as string,
      shiftId: r.shift_id as string,
      kind: r.kind as CashMovementKind,
      amountMinor: Number(r.amount_minor),
      currency: (r.currency as string).trim(),
      reason: (r.reason as string | null) ?? null,
      invoiceNumber: (r.invoice_number as string | null) ?? null,
      actorName: (r.actor_name as string | null) ?? null,
      createdAt: r.created_at as string,
    })),
  };
}

export interface RegisterRow {
  id: string;
  name: string;
  status: string;
  openShiftId: string | null;
  openSince: string | null;
  openExpectedCashMinor: number | null;
  currency: string;
}

export async function listRegisters(hallId: string): Promise<RegisterRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_registers", { p_hall_id: hallId });
  if (error) return null;
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    status: r.status as string,
    openShiftId: (r.open_shift_id as string | null) ?? null,
    openSince: (r.open_since as string | null) ?? null,
    openExpectedCashMinor: nullableNumber(r.open_expected_cash_minor),
    currency: (r.currency as string).trim(),
  }));
}
