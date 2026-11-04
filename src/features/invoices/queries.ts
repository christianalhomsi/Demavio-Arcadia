import "server-only";
import { createClient } from "@/lib/supabase/server";

export type InvoiceStatus = "open" | "partially_paid" | "paid" | "voided";

/** Every amount here comes from the database. The web only displays and compares them. */
export interface InvoiceRow {
  id: string;
  number: string;
  sessionId: string;
  deviceName: string;
  customerName: string | null;
  currency: string;
  totalMinor: number;
  paidMinor: number;
  refundedMinor: number;
  outstandingMinor: number;
  status: InvoiceStatus;
  billableSeconds: number;
  billedMinutes: number;
  createdAt: string;
}

type Row = Record<string, unknown>;

const toInvoice = (r: Row): InvoiceRow => ({
  id: r.id as string,
  number: r.number as string,
  sessionId: r.session_id as string,
  deviceName: r.device_name as string,
  customerName: (r.customer_name as string | null) ?? null,
  currency: (r.currency as string).trim(),
  totalMinor: Number(r.total_minor),
  paidMinor: Number(r.paid_minor),
  refundedMinor: Number(r.refunded_minor),
  outstandingMinor: Number(r.outstanding_minor),
  status: r.status as InvoiceStatus,
  billableSeconds: Number(r.billable_seconds),
  billedMinutes: Number(r.billed_minutes),
  createdAt: r.created_at as string,
});

export async function listInvoices(
  hallId: string,
  opts: {
    limit: number;
    offset: number;
    status?: string;
    outstandingOnly?: boolean;
    invoiceId?: string;
  },
): Promise<{ rows: InvoiceRow[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_invoices", {
    p_hall_id: hallId,
    p_status: opts.status ?? null,
    p_outstanding_only: opts.outstandingOnly ?? false,
    p_limit: opts.limit,
    p_offset: opts.offset,
    p_invoice_id: opts.invoiceId ?? null,
  });
  if (error) return null;
  const rows = (data ?? []) as Row[];
  return { total: rows[0] ? Number(rows[0].total) : 0, rows: rows.map(toInvoice) };
}

export interface PaymentRow {
  id: string;
  method: "cash" | "wallet";
  amountMinor: number;
  currency: string;
  createdAt: string;
}
export interface InvoiceItemRow {
  id: string;
  description: string;
  amountMinor: number;
  detail: Record<string, unknown> | null;
}

export async function getInvoiceDetail(hallId: string, invoiceId: string) {
  const page = await listInvoices(hallId, { limit: 1, offset: 0, invoiceId });
  const invoice = page?.rows[0];
  if (!invoice) return null;
  const supabase = await createClient();
  const [items, payments] = await Promise.all([
    supabase
      .from("invoice_items")
      .select("id,description,amount_minor,detail")
      .eq("invoice_id", invoiceId),
    supabase
      .from("payments")
      .select("id,method,amount_minor,currency,created_at")
      .eq("invoice_id", invoiceId)
      .order("created_at"),
  ]);
  return {
    invoice,
    items: (items.data ?? []).map((i): InvoiceItemRow => ({
      id: i.id,
      description: i.description,
      amountMinor: Number(i.amount_minor),
      detail: i.detail,
    })),
    payments: (payments.data ?? []).map((p): PaymentRow => ({
      id: p.id,
      method: p.method,
      amountMinor: Number(p.amount_minor),
      currency: String(p.currency).trim(),
      createdAt: p.created_at,
    })),
  };
}

export async function getHallCurrency(hallId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("halls").select("currency").eq("id", hallId).maybeSingle();
  return data ? String(data.currency).trim() : null;
}

/** Invoice (if any) created from a session; used to link session pages to their invoice. */
export async function getInvoiceForSession(
  sessionId: string,
): Promise<{ id: string; number: string; status: InvoiceStatus } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id,number,status")
    .eq("session_id", sessionId)
    .maybeSingle();
  return data ? { id: data.id, number: data.number, status: data.status as InvoiceStatus } : null;
}
