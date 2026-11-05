import "server-only";
import { createClient } from "@/lib/supabase/server";

export type RefundStatus = "pending" | "approved" | "rejected";

export interface RefundRow {
  id: string;
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  method: "cash" | "wallet";
  amountMinor: number;
  currency: string;
  reasonCode: string;
  note: string | null;
  status: RefundStatus;
  requestedByName: string | null;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export async function listRefunds(
  hallId: string,
  opts: { status?: RefundStatus; limit: number; offset: number },
): Promise<{ rows: RefundRow[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_refunds", {
    p_hall_id: hallId,
    p_status: opts.status ?? null,
    p_limit: opts.limit,
    p_offset: opts.offset,
  });
  if (error) return null;
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    rows: rows.map((r) => ({
      id: r.id as string,
      paymentId: r.payment_id as string,
      invoiceId: r.invoice_id as string,
      invoiceNumber: r.invoice_number as string,
      method: r.method as RefundRow["method"],
      amountMinor: Number(r.amount_minor),
      currency: (r.currency as string).trim(),
      reasonCode: r.reason_code as string,
      note: (r.note as string | null) ?? null,
      status: r.status as RefundStatus,
      requestedByName: (r.requested_by_name as string | null) ?? null,
      requestedAt: r.requested_at as string,
      decidedByName: (r.decided_by_name as string | null) ?? null,
      decidedAt: (r.decided_at as string | null) ?? null,
      decisionNote: (r.decision_note as string | null) ?? null,
    })),
  };
}
