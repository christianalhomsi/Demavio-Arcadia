import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface DiscountRow {
  id: string;
  name: string;
  kind: "amount" | "percent";
  /** Minor units for "amount", basis points (1250 = 12.5%) for "percent". */
  value: number;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  uses: number;
  active: boolean;
  currency: string;
}

export interface InvoiceDiscountRow {
  id: string;
  name: string;
  kind: "amount" | "percent";
  value: number;
  originalMinor: number;
  amountMinor: number;
  finalMinor: number;
  reason: string;
  appliedByName: string | null;
  createdAt: string;
}

export async function listDiscounts(hallId: string): Promise<DiscountRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_discounts", { p_hall_id: hallId });
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as DiscountRow["kind"],
    value: Number(r.value),
    validFrom: (r.valid_from as string | null) ?? null,
    validUntil: (r.valid_until as string | null) ?? null,
    maxUses: r.max_uses == null ? null : Number(r.max_uses),
    uses: Number(r.uses),
    active: Boolean(r.active),
    currency: String(r.currency).trim(),
  }));
}

export async function listInvoiceDiscounts(
  invoiceId: string,
): Promise<InvoiceDiscountRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_invoice_discounts", {
    p_invoice_id: invoiceId,
  });
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as InvoiceDiscountRow["kind"],
    value: Number(r.value),
    originalMinor: Number(r.original_minor),
    amountMinor: Number(r.amount_minor),
    finalMinor: Number(r.final_minor),
    reason: r.reason as string,
    appliedByName: (r.applied_by_name as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}
