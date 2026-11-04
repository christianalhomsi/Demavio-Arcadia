import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
const getHallCurrency = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/invoices/queries", () => ({
  getHallCurrency: (...a: unknown[]) => getHallCurrency(...a),
}));

import { openWalletAction, topUpWalletAction } from "./actions";

const WAL = "99999999-0000-4000-8000-000000000001";
const KEY = "55555555-0000-4000-8000-000000000001";

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
  getHallCurrency.mockReset();
  getCtx.mockResolvedValue(PERSONAS.employeeH1);
  getHallCurrency.mockResolvedValue("USD");
  rpc.mockResolvedValue({ ok: true, data: WAL });
});

describe("topUpWalletAction", () => {
  it("converts the typed amount to minor units with the HALL's currency", async () => {
    expect(await topUpWalletAction(HALLS.h1, WAL, "25.50", KEY)).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith("wallet_top_up", {
      p_wallet_id: WAL,
      p_amount_minor: 2550,
      p_key: KEY,
    });
    getHallCurrency.mockResolvedValue("JPY");
    await topUpWalletAction(HALLS.h1, WAL, "500", KEY);
    expect(rpc).toHaveBeenLastCalledWith(
      "wallet_top_up",
      expect.objectContaining({ p_amount_minor: 500 }),
    );
  });
  it("rejects bad amounts and ids before the database", async () => {
    for (const text of ["", "0", "-1", "abc", "1.234", "1e5"]) {
      expect(await topUpWalletAction(HALLS.h1, WAL, text, KEY)).toMatchObject({
        code: "VALIDATION",
      });
    }
    expect(await topUpWalletAction(HALLS.h1, "x", "5", KEY)).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("is refused to outsiders and sales", async () => {
    for (const p of ["ownerH3", "salesAgent", "customerOnly"] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(await topUpWalletAction(HALLS.h1, WAL, "5", KEY)).toMatchObject({ ok: false });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("openWalletAction", () => {
  it("validates the email and returns the wallet id", async () => {
    expect(await openWalletAction(HALLS.h1, "not-an-email")).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
    expect(await openWalletAction(HALLS.h1, " customer@example.test ")).toEqual({
      ok: true,
      data: { walletId: WAL },
    });
    expect(rpc).toHaveBeenCalledWith("open_wallet", {
      p_hall_id: HALLS.h1,
      p_customer_email: "customer@example.test",
    });
  });
  it("gives the same answer for unknown emails (no account enumeration beyond 'not found')", async () => {
    rpc.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "x" });
    const r = await openWalletAction(HALLS.h1, "nobody@example.test");
    expect(r).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: { email: "No customer account was found for that email." },
    });
  });
});
