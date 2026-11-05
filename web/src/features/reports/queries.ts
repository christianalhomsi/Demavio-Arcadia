import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * The §13.3 categories, each as its own figure. They are computed by the database and displayed as
 * received: the web adds, subtracts and nets nothing.
 */
export interface FinancialSummary {
  currency: string;
  sessionsEnded: number;
  billableSeconds: number;
  invoicesCount: number;
  invoicedMinor: number;
  voidedMinor: number;
  collectionsCashMinor: number;
  collectionsWalletMinor: number;
  refundsCashMinor: number;
  refundsWalletMinor: number;
  walletTopUpsMinor: number;
  payoutsMinor: number;
  cashAdjustmentsMinor: number;
  shiftsClosed: number;
  registerDifferenceMinor: number;
  /** As of now, not for the period. */
  outstandingCount: number;
  outstandingMinor: number;
  walletLiabilityMinor: number;
}

export async function getFinancialSummary(
  hallId: string,
  from: Date,
  to: Date,
): Promise<FinancialSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_financial_summary", {
    p_hall_id: hallId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  const r = (data as Record<string, unknown>[] | null)?.[0];
  if (error || !r) return null;
  const n = (k: string) => Number(r[k]);
  return {
    currency: (r.currency as string).trim(),
    sessionsEnded: n("sessions_ended"),
    billableSeconds: n("billable_seconds"),
    invoicesCount: n("invoices_count"),
    invoicedMinor: n("invoiced_minor"),
    voidedMinor: n("voided_minor"),
    collectionsCashMinor: n("collections_cash_minor"),
    collectionsWalletMinor: n("collections_wallet_minor"),
    refundsCashMinor: n("refunds_cash_minor"),
    refundsWalletMinor: n("refunds_wallet_minor"),
    walletTopUpsMinor: n("wallet_top_ups_minor"),
    payoutsMinor: n("payouts_minor"),
    cashAdjustmentsMinor: n("cash_adjustments_minor"),
    shiftsClosed: n("shifts_closed"),
    registerDifferenceMinor: n("register_difference_minor"),
    outstandingCount: n("outstanding_count"),
    outstandingMinor: n("outstanding_minor"),
    walletLiabilityMinor: n("wallet_liability_minor"),
  };
}

export interface BreakdownRow {
  dimension: string;
  key: string;
  label: string;
  itemCount: number;
  amountMinor: number;
}

/** Every breakdown row is computed by the database; the web only draws them. */
export async function getBreakdown(
  hallId: string,
  from: Date,
  to: Date,
): Promise<BreakdownRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_breakdown", {
    p_hall_id: hallId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    dimension: r.dimension as string,
    key: r.key as string,
    label: (r.label as string) ?? "",
    itemCount: Number(r.item_count),
    amountMinor: Number(r.amount_minor),
  }));
}
