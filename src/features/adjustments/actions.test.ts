import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/invoices/queries", () => ({ getHallCurrency: async () => "USD" }));

import { setWalletStatusAction, withdrawFromWalletAction } from "@/features/wallets/actions";
import { writeOffInvoiceAction } from "./actions";

const ID = "55555555-0000-4000-8000-000000000001";
const KEY = "88888888-0000-4000-8000-000000000001";

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
  getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
  rpc.mockResolvedValue({ ok: true, data: ID });
});

describe("write-off", () => {
  it("is owner-only and never reaches the database for others", async () => {
    for (const p of ["employeeH1", "salesAgent", "ownerH3", "superAdmin"] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(
        await writeOffInvoiceAction(HALLS.h1, ID, "", "Left without paying", KEY),
      ).toMatchObject({
        ok: false,
      });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("empty amount means everything owed; a typed amount becomes minor units", async () => {
    await writeOffInvoiceAction(HALLS.h1, ID, "", "Left without paying", KEY);
    expect(rpc).toHaveBeenLastCalledWith("write_off_invoice", {
      p_invoice_id: ID,
      p_amount_minor: null,
      p_reason: "Left without paying",
      p_key: KEY,
    });
    await writeOffInvoiceAction(HALLS.h1, ID, "2.5", "Goodwill", KEY);
    expect(rpc).toHaveBeenLastCalledWith(
      "write_off_invoice",
      expect.objectContaining({ p_amount_minor: 250 }),
    );
  });
  it("validates reason, amount and ids locally", async () => {
    expect(await writeOffInvoiceAction(HALLS.h1, ID, "", "ab", KEY)).toMatchObject({ ok: false });
    expect(await writeOffInvoiceAction(HALLS.h1, ID, "abc", "Because", KEY)).toMatchObject({
      ok: false,
    });
    expect(await writeOffInvoiceAction(HALLS.h1, ID, "0", "Because", KEY)).toMatchObject({
      ok: false,
    });
    expect(await writeOffInvoiceAction(HALLS.h1, "x", "", "Because", KEY)).toMatchObject({
      ok: false,
    });
    expect(await writeOffInvoiceAction(HALLS.h1, ID, "", "Because", "bad")).toMatchObject({
      ok: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("wallet freeze and withdraw", () => {
  it("are owner-only", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    expect(await setWalletStatusAction(HALLS.h1, ID, true, "Suspicious")).toMatchObject({
      ok: false,
    });
    expect(await withdrawFromWalletAction(HALLS.h1, ID, "5", "Closing", KEY)).toMatchObject({
      ok: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("sends the freeze flag with a reason, and the withdrawal in minor units", async () => {
    await setWalletStatusAction(HALLS.h1, ID, true, "Suspicious");
    expect(rpc).toHaveBeenLastCalledWith("set_wallet_status", {
      p_wallet_id: ID,
      p_frozen: true,
      p_reason: "Suspicious",
    });
    await withdrawFromWalletAction(HALLS.h1, ID, "12.50", "Closing", KEY);
    expect(rpc).toHaveBeenLastCalledWith("withdraw_from_wallet", {
      p_wallet_id: ID,
      p_amount_minor: 1250,
      p_reason: "Closing",
      p_key: KEY,
    });
  });
  it("needs a reason and a valid amount", async () => {
    expect(await setWalletStatusAction(HALLS.h1, ID, true, "")).toMatchObject({ ok: false });
    expect(await withdrawFromWalletAction(HALLS.h1, ID, "5", "x", KEY)).toMatchObject({
      ok: false,
    });
    expect(await withdrawFromWalletAction(HALLS.h1, ID, "-5", "Closing", KEY)).toMatchObject({
      ok: false,
    });
    expect(await withdrawFromWalletAction(HALLS.h1, ID, "5", "Closing", "bad")).toMatchObject({
      ok: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
