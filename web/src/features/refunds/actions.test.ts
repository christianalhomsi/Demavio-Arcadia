import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/invoices/queries", () => ({ getHallCurrency: async () => "USD" }));

import { decideRefundAction, requestRefundAction } from "./actions";

const PAY = "77777777-0000-4000-8000-000000000001";
const REF = "66666666-0000-4000-8000-000000000001";
const KEY = "55555555-0000-4000-8000-000000000001";

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
  getCtx.mockResolvedValue(PERSONAS.employeeH1);
  rpc.mockResolvedValue({ ok: true, data: REF });
});

describe("requestRefundAction", () => {
  it("sends minor units, reason and key; employees may request", async () => {
    expect(
      await requestRefundAction(
        HALLS.h1,
        PAY,
        { amountText: "1.50", reasonCode: "overcharge", note: "" },
        KEY,
      ),
    ).toEqual({ ok: true, data: { refundId: REF } });
    expect(rpc).toHaveBeenCalledWith("request_refund", {
      p_payment_id: PAY,
      p_amount_minor: 150,
      p_reason_code: "overcharge",
      p_note: null,
      p_key: KEY,
    });
  });
  it("validates locally", async () => {
    const call = (over: object) =>
      requestRefundAction(
        HALLS.h1,
        PAY,
        { amountText: "1", reasonCode: "overcharge", note: "", ...over },
        KEY,
      );
    expect(await call({ amountText: "0" })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ amountText: "x" })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ reasonCode: "because" })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ reasonCode: "other", note: " " })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ note: "x".repeat(301) })).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("is refused to outsiders", async () => {
    for (const p of ["ownerH3", "salesAgent", "customerOnly"] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(
        await requestRefundAction(
          HALLS.h1,
          PAY,
          { amountText: "1", reasonCode: "overcharge", note: "" },
          KEY,
        ),
      ).toMatchObject({ ok: false });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("decideRefundAction", () => {
  it("employees cannot approve or reject; owners can, and the database still checks the requester", async () => {
    expect(await decideRefundAction(HALLS.h1, REF, true, "")).toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    rpc.mockResolvedValue({ ok: true, data: null });
    expect(await decideRefundAction(HALLS.h1, REF, true, "ok")).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("decide_refund", {
      p_refund_id: REF,
      p_approve: true,
      p_note: "ok",
    });
    rpc.mockResolvedValue({
      ok: false,
      code: "PRECONDITION_FAILED",
      message: "You can't approve a refund you requested yourself. Ask another approver.",
    });
    expect(await decideRefundAction(HALLS.h1, REF, true, "")).toMatchObject({
      ok: false,
      message: expect.stringContaining("another approver"),
    });
  });
  it("rejects malformed ids and long notes", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    expect(await decideRefundAction(HALLS.h1, "x", true, "")).toMatchObject({ code: "VALIDATION" });
    expect(await decideRefundAction(HALLS.h1, REF, true, "x".repeat(301))).toMatchObject({
      code: "VALIDATION",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
