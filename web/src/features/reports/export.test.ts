import { describe, expect, it } from "vitest";
import { buildSummaryCsv, csvCell, summaryLines } from "./export";
import type { FinancialSummary } from "./queries";

const s: FinancialSummary = {
  currency: "USD",
  sessionsEnded: 2,
  billableSeconds: 5400,
  invoicesCount: 2,
  invoicedMinor: 900,
  voidedMinor: 300,
  collectionsCashMinor: 300,
  collectionsWalletMinor: 600,
  refundsCashMinor: 100,
  refundsWalletMinor: 0,
  walletTopUpsMinor: 5000,
  payoutsMinor: 50,
  cashAdjustmentsMinor: -20,
  shiftsClosed: 1,
  registerDifferenceMinor: -50,
  outstandingCount: 1,
  outstandingMinor: 600,
  walletLiabilityMinor: 4400,
};

describe("csvCell", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(12)).toBe("12");
  });
  it("defuses spreadsheet formulas in text", () => {
    for (const bad of ["=1+1", "+cmd", "-2", "@SUM(A1)"]) expect(csvCell(bad)).toBe(`'${bad}`);
    expect(csvCell(-50)).toBe("-50"); // numbers stay numbers
  });
});

describe("buildSummaryCsv", () => {
  const csv = buildSummaryCsv(s, { from: "2026-10-26", to: "2026-10-26" });
  const lines = csv.trimEnd().split("\r\n");

  it("carries the period and the minor-unit note", () => {
    expect(lines[1]).toBe("period_from,2026-10-26");
    expect(lines[2]).toBe("period_to_inclusive,2026-10-26");
    expect(csv).toContain("minor units");
  });
  it("has one row per figure with the backend's value, unchanged", () => {
    const rows = Object.fromEntries(
      lines
        .slice(6)
        .map((l) => l.split(","))
        .map((c) => [c[0], c]),
    );
    expect(rows.invoiced).toEqual(["invoiced", "Invoiced", "period", "900", "USD"]);
    expect(rows.register_difference![3]).toBe("-50");
    expect(rows.cash_adjustments![3]).toBe("-20");
    expect(lines.length - 6).toBe(summaryLines(s).length);
  });
  it("keeps top-ups out of revenue and labels snapshots as 'now'", () => {
    expect(csv).toContain("wallet_top_ups,Wallet top-ups (stored value");
    expect(csv).toMatch(/outstanding,Outstanding invoices \(amount\),now,600,USD/);
    expect(csv).toMatch(/wallet_liability,Wallet liability,now,4400,USD/);
  });
  it("counts and durations have no currency", () => {
    expect(csv).toContain("sessions_ended,Sessions ended,period,2,\r\n");
  });
});
