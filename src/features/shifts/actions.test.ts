import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
const getCurrency = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/invoices/queries", () => ({ getHallCurrency: () => getCurrency() }));

import { closeShiftAction, openShiftAction, recordCashMovementAction } from "./actions";

const SHIFT = "88888888-0000-4000-8000-000000000001";
const KEY = "55555555-0000-4000-8000-000000000001";

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
  getCurrency.mockReset();
  getCtx.mockResolvedValue(PERSONAS.employeeH1);
  getCurrency.mockResolvedValue("USD");
  rpc.mockResolvedValue({ ok: true, data: SHIFT });
});

describe("openShiftAction", () => {
  it("converts the typed opening cash to minor units and sends the key", async () => {
    expect(await openShiftAction(HALLS.h1, "100.50", KEY)).toEqual({
      ok: true,
      data: { shiftId: SHIFT },
    });
    expect(rpc).toHaveBeenCalledWith("open_shift", {
      p_hall_id: HALLS.h1,
      p_register_id: null,
      p_opening_cash_minor: 10050,
      p_key: KEY,
    });
  });
  it("uses the hall's currency for the conversion (zero-decimal currency)", async () => {
    getCurrency.mockResolvedValue("JPY");
    await openShiftAction(HALLS.h1, "500", KEY);
    expect(rpc).toHaveBeenCalledWith(
      "open_shift",
      expect.objectContaining({ p_opening_cash_minor: 500 }),
    );
    expect(await openShiftAction(HALLS.h1, "5.5", KEY)).toMatchObject({ code: "VALIDATION" });
  });
  it("allows zero and rejects junk, negatives and bad keys without calling the backend", async () => {
    expect(await openShiftAction(HALLS.h1, "0", KEY)).toMatchObject({ ok: true });
    rpc.mockClear();
    for (const bad of ["", "abc", "-1", "1,5", "1e3"]) {
      expect(await openShiftAction(HALLS.h1, bad, KEY)).toMatchObject({ code: "VALIDATION" });
    }
    expect(await openShiftAction(HALLS.h1, "1", "not-a-key")).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("is refused to outsiders before reaching the backend", async () => {
    for (const p of [
      "ownerH3",
      "salesAgent",
      "superAdmin",
      "customerOnly",
      "deactivated",
    ] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(await openShiftAction(HALLS.h1, "1", KEY)).toMatchObject({ ok: false });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("passes backend refusals through with a friendly message", async () => {
    rpc.mockResolvedValue({
      ok: false,
      code: "PRECONDITION_FAILED",
      message: "A shift is already open for this register.",
    });
    expect(await openShiftAction(HALLS.h1, "1", KEY)).toMatchObject({
      ok: false,
      code: "PRECONDITION_FAILED",
    });
  });
});

describe("closeShiftAction", () => {
  const out = {
    expected_minor: 1300,
    counted_minor: 1250,
    difference_minor: -50,
    overridden: false,
    unpaid_count: 0,
  };

  it("sends the counted cash in minor units and returns the BACKEND's figures", async () => {
    rpc.mockResolvedValue({ ok: true, data: out });
    expect(await closeShiftAction(HALLS.h1, SHIFT, { countedCashText: "12.50" }, KEY)).toEqual({
      ok: true,
      data: {
        expectedMinor: 1300,
        countedMinor: 1250,
        differenceMinor: -50,
        overridden: false,
        unpaidCount: 0,
      },
    });
    expect(rpc).toHaveBeenCalledWith("close_shift", {
      p_shift_id: SHIFT,
      p_counted_cash_minor: 1250,
      p_override_reason: null,
      p_key: KEY,
    });
  });
  it("forwards a trimmed override reason; blank means no override", async () => {
    rpc.mockResolvedValue({ ok: true, data: { ...out, overridden: true, unpaid_count: 2 } });
    await closeShiftAction(
      HALLS.h1,
      SHIFT,
      { countedCashText: "1", overrideReason: "  pays tomorrow  " },
      KEY,
    );
    expect(rpc).toHaveBeenLastCalledWith(
      "close_shift",
      expect.objectContaining({ p_override_reason: "pays tomorrow" }),
    );
    await closeShiftAction(HALLS.h1, SHIFT, { countedCashText: "1", overrideReason: "   " }, KEY);
    expect(rpc).toHaveBeenLastCalledWith(
      "close_shift",
      expect.objectContaining({ p_override_reason: null }),
    );
  });
  it("validates locally", async () => {
    const call = (over: object) =>
      closeShiftAction(HALLS.h1, SHIFT, { countedCashText: "1", ...over }, KEY);
    expect(await call({ countedCashText: "x" })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ overrideReason: "x" })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ overrideReason: "x".repeat(301) })).toMatchObject({ code: "VALIDATION" });
    expect(await closeShiftAction(HALLS.h1, "nope", { countedCashText: "1" }, KEY)).toMatchObject({
      code: "VALIDATION",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("surfaces the database's unpaid-invoice refusal", async () => {
    rpc.mockResolvedValue({
      ok: false,
      code: "PRECONDITION_FAILED",
      message: "There are unpaid invoices.",
    });
    expect(await closeShiftAction(HALLS.h1, SHIFT, { countedCashText: "1" }, KEY)).toMatchObject({
      ok: false,
      code: "PRECONDITION_FAILED",
    });
  });
  it("is refused to other tenants", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH3);
    expect(await closeShiftAction(HALLS.h1, SHIFT, { countedCashText: "1" }, KEY)).toMatchObject({
      ok: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("recordCashMovementAction", () => {
  const input = { kind: "payout", amountText: "5", reason: "Supplies" };

  it("is owner-level: employees are refused locally", async () => {
    expect(await recordCashMovementAction(HALLS.h1, SHIFT, input, KEY)).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("owners record movements with minor units, reason and key", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    expect(await recordCashMovementAction(HALLS.h1, SHIFT, input, KEY)).toEqual({
      ok: true,
      data: null,
    });
    expect(rpc).toHaveBeenCalledWith("record_cash_movement", {
      p_shift_id: SHIFT,
      p_kind: "payout",
      p_amount_minor: 500,
      p_reason: "Supplies",
      p_key: KEY,
    });
  });
  it("validates type, amount and reason", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    const call = (over: object) =>
      recordCashMovementAction(HALLS.h1, SHIFT, { ...input, ...over }, KEY);
    expect(await call({ kind: "cash_payment" })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ amountText: "0" })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ amountText: "-1" })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ reason: "no" })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ reason: "x".repeat(301) })).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
