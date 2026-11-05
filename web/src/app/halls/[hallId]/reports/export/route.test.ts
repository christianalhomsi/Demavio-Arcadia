import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../../../../tests/authz/personas";

const getCtx = vi.fn();
const rpc = vi.fn();
const summary = vi.fn();
const order: string[] = [];
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({
  callRpc: (...a: unknown[]) => {
    order.push("audit");
    return rpc(...a);
  },
}));
vi.mock("@/features/halls/queries", () => ({ getHallTimeZone: async () => "UTC" }));
vi.mock("@/features/reports/queries", () => ({
  getFinancialSummary: (...a: unknown[]) => {
    order.push("data");
    return summary(...a);
  },
}));

import { GET } from "./route";

const data = {
  currency: "USD",
  sessionsEnded: 1,
  billableSeconds: 60,
  invoicesCount: 1,
  invoicedMinor: 100,
  voidedMinor: 0,
  collectionsCashMinor: 100,
  collectionsWalletMinor: 0,
  refundsCashMinor: 0,
  refundsWalletMinor: 0,
  walletTopUpsMinor: 0,
  payoutsMinor: 0,
  cashAdjustmentsMinor: 0,
  shiftsClosed: 0,
  registerDifferenceMinor: 0,
  outstandingCount: 0,
  outstandingMinor: 0,
  walletLiabilityMinor: 0,
};
const call = (hallId: string = HALLS.h1, qs = "?from=2026-10-01&to=2026-10-02") =>
  GET(new Request(`http://localhost/halls/${hallId}/reports/export${qs}`), {
    params: Promise.resolve({ hallId }),
  });

beforeEach(() => {
  order.length = 0;
  rpc.mockReset().mockResolvedValue({ ok: true, data: null });
  summary.mockReset().mockResolvedValue(data);
  getCtx.mockReset().mockResolvedValue(PERSONAS.ownerH1H2);
});

describe("CSV export route", () => {
  it("returns an attachment and records the audit entry BEFORE reading any data", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain(
      "financial-summary-2026-10-01_2026-10-02.csv",
    );
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(await res.text()).toContain("invoiced,Invoiced,period,100,USD");
    expect(order).toEqual(["audit", "data"]);
    expect(rpc).toHaveBeenCalledWith(
      "record_report_export",
      expect.objectContaining({ p_hall_id: HALLS.h1, p_report: "financial_summary" }),
    );
  });
  it("does not return data if the audit entry cannot be written or is refused", async () => {
    rpc.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "x" });
    expect((await call()).status).toBe(403);
    rpc.mockResolvedValue({ ok: false, code: "UNKNOWN", message: "x" });
    expect((await call()).status).toBe(400);
    expect(summary).not.toHaveBeenCalled();
  });
  it("refuses anonymous, other tenants, employees and platform roles without touching the backend", async () => {
    getCtx.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    for (const [p, status] of [
      ["employeeH1", 403],
      ["ownerH3", 404],
      ["salesAgent", 404],
      ["superAdmin", 404],
      ["customerOnly", 404],
      ["deactivated", 404],
    ] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect((await call()).status, p).toBe(status);
    }
    expect((await call("not-a-uuid")).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    expect(summary).not.toHaveBeenCalled();
  });
  it("falls back to today for a junk period instead of failing", async () => {
    expect((await call(HALLS.h1, "?from=nope&to=x")).status).toBe(200);
  });
});
