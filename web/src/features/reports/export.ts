import type { FinancialSummary } from "./queries";
import type { ReportPeriod } from "./period";

/**
 * CSV of the SAME figures the screen shows. Nothing is calculated here: each value is the backend's
 * number in minor units, with its currency next to it (spec §10.2), so the file can be checked against
 * the screen line by line.
 */

/** Quotes a cell and defuses spreadsheet formulas (a leading = + - @ would otherwise be executed). */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

interface Line {
  key: string;
  label: string;
  value: number;
  money: boolean;
  scope: "period" | "now";
}

export function summaryLines(s: FinancialSummary): Line[] {
  const p = (key: string, label: string, value: number, money = true): Line => ({
    key,
    label,
    value,
    money,
    scope: "period",
  });
  const now = (key: string, label: string, value: number, money = true): Line => ({
    key,
    label,
    value,
    money,
    scope: "now",
  });
  return [
    p("sessions_ended", "Sessions ended", s.sessionsEnded, false),
    p("billable_seconds", "Billable seconds", s.billableSeconds, false),
    p("invoices_count", "Invoices (non-voided)", s.invoicesCount, false),
    p("invoiced", "Invoiced", s.invoicedMinor),
    p("voided", "Voided invoices", s.voidedMinor),
    p("collections_cash", "Cash collected", s.collectionsCashMinor),
    p("collections_wallet", "Paid from wallets", s.collectionsWalletMinor),
    p("refunds_cash", "Refunded to cash", s.refundsCashMinor),
    p("refunds_wallet", "Refunded to wallets", s.refundsWalletMinor),
    p("wallet_top_ups", "Wallet top-ups (stored value - not revenue)", s.walletTopUpsMinor),
    p("payouts", "Payouts", s.payoutsMinor),
    p("cash_adjustments", "Manual cash adjustments (net)", s.cashAdjustmentsMinor),
    p("shifts_closed", "Shifts closed", s.shiftsClosed, false),
    p("register_difference", "Register differences", s.registerDifferenceMinor),
    now("outstanding_count", "Outstanding invoices (count)", s.outstandingCount, false),
    now("outstanding", "Outstanding invoices (amount)", s.outstandingMinor),
    now("wallet_liability", "Wallet liability", s.walletLiabilityMinor),
  ];
}

export function buildSummaryCsv(s: FinancialSummary, period: Pick<ReportPeriod, "from" | "to">) {
  const rows: (string | number)[][] = [
    ["report", "financial_summary"],
    ["period_from", period.from],
    ["period_to_inclusive", period.to],
    ["note", "Amounts are in minor units (for example cents) of the hall currency"],
    [],
    ["metric", "label", "scope", "value", "currency"],
    ...summaryLines(s).map((l) => [l.key, l.label, l.scope, l.value, l.money ? s.currency : ""]),
  ];
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
