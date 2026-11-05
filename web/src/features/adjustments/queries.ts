import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AdjustmentRow {
  kind: "write_off" | "discount" | "void";
  invoiceId: string;
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  reason: string | null;
  actorName: string | null;
  createdAt: string;
}

export async function listAdjustments(
  hallId: string,
  opts: { limit: number; offset: number },
): Promise<{ rows: AdjustmentRow[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_adjustments", {
    p_hall_id: hallId,
    p_limit: opts.limit,
    p_offset: opts.offset,
  });
  if (error) return null;
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    rows: rows.map((r) => ({
      kind: r.kind as AdjustmentRow["kind"],
      invoiceId: r.invoice_id as string,
      invoiceNumber: r.invoice_number as string,
      amountMinor: Number(r.amount_minor),
      currency: String(r.currency).trim(),
      reason: (r.reason as string | null) ?? null,
      actorName: (r.actor_name as string | null) ?? null,
      createdAt: r.created_at as string,
    })),
  };
}

export interface PaymentDetail {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  method: "cash" | "wallet";
  amountMinor: number;
  currency: string;
  operatorName: string | null;
  shiftId: string | null;
  customerName: string | null;
  createdAt: string;
  refundedMinor: number;
  refundPendingMinor: number;
}

export interface PaymentRefund {
  id: string;
  amountMinor: number;
  status: "pending" | "approved" | "rejected";
  reasonCode: string;
  note: string | null;
  requestedByName: string | null;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
}

export async function getPaymentDetail(paymentId: string): Promise<PaymentDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_payment_detail", { p_payment_id: paymentId });
  const r = ((data ?? []) as Record<string, unknown>[])[0];
  if (error || !r) return null;
  return {
    id: r.id as string,
    invoiceId: r.invoice_id as string,
    invoiceNumber: r.invoice_number as string,
    method: r.method as PaymentDetail["method"],
    amountMinor: Number(r.amount_minor),
    currency: String(r.currency).trim(),
    operatorName: (r.operator_name as string | null) ?? null,
    shiftId: (r.shift_id as string | null) ?? null,
    customerName: (r.customer_name as string | null) ?? null,
    createdAt: r.created_at as string,
    refundedMinor: Number(r.refunded_minor),
    refundPendingMinor: Number(r.refund_pending_minor),
  };
}

export async function listPaymentRefunds(paymentId: string): Promise<PaymentRefund[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_payment_refunds", { p_payment_id: paymentId });
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    amountMinor: Number(r.amount_minor),
    status: r.status as PaymentRefund["status"],
    reasonCode: r.reason_code as string,
    note: (r.note as string | null) ?? null,
    requestedByName: (r.requested_by_name as string | null) ?? null,
    requestedAt: r.requested_at as string,
    decidedByName: (r.decided_by_name as string | null) ?? null,
    decidedAt: (r.decided_at as string | null) ?? null,
  }));
}
