import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
const listInvoices = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./queries", () => ({ listInvoices: (...a: unknown[]) => listInvoices(...a) }));

import { collectPaymentAction, voidInvoiceAction } from "./actions";

const INV = "88888888-0000-4000-8000-000000000001";
const WAL = "99999999-0000-4000-8000-000000000001";
const KEY = "55555555-0000-4000-8000-000000000001";
const invoice = (over = {}) => ({
  id: INV,
  currency: "USD",
  outstandingMinor: 300,
  totalMinor: 300,
  ...over,
});

beforeEach(() => {
  rpc.mockReset();
  listInvoices.mockReset();
  getCtx.mockReset();
  getCtx.mockResolvedValue(PERSONAS.employeeH1);
  listInvoices.mockResolvedValue({ rows: [invoice()], total: 1 });
  rpc.mockResolvedValue({ ok: true, data: "pay-1" });
});

describe("collectPaymentAction", () => {
  it("'full' pays the amount the DATABASE says is outstanding, never a browser-supplied number", async () => {
    await collectPaymentAction(
      HALLS.h1,
      INV,
      { method: "cash", walletId: null, amount: { kind: "full" } },
      KEY,
    );
    expect(rpc).toHaveBeenCalledWith("record_cash_payment", {
      p_invoice_id: INV,
      p_amount_minor: 300,
      p_key: KEY,
    });
  });
  it("converts a typed partial amount using the invoice's currency", async () => {
    await collectPaymentAction(
      HALLS.h1,
      INV,
      { method: "cash", walletId: null, amount: { kind: "custom", text: "1.50" } },
      KEY,
    );
    expect(rpc).toHaveBeenLastCalledWith(
      "record_cash_payment",
      expect.objectContaining({ p_amount_minor: 150 }),
    );
    listInvoices.mockResolvedValue({ rows: [invoice({ currency: "JPY" })], total: 1 });
    await collectPaymentAction(
      HALLS.h1,
      INV,
      { method: "cash", walletId: null, amount: { kind: "custom", text: "200" } },
      KEY,
    );
    expect(rpc).toHaveBeenLastCalledWith(
      "record_cash_payment",
      expect.objectContaining({ p_amount_minor: 200 }),
    );
    const bad = await collectPaymentAction(
      HALLS.h1,
      INV,
      { method: "cash", walletId: null, amount: { kind: "custom", text: "2.5" } },
      KEY,
    );
    expect(bad).toMatchObject({ code: "VALIDATION" });
  });
  it("routes wallet payments to the wallet function with the chosen wallet", async () => {
    await collectPaymentAction(
      HALLS.h1,
      INV,
      { method: "wallet", walletId: WAL, amount: { kind: "full" } },
      KEY,
    );
    expect(rpc).toHaveBeenCalledWith("pay_invoice_from_wallet", {
      p_invoice_id: INV,
      p_wallet_id: WAL,
      p_amount_minor: 300,
      p_key: KEY,
    });
    rpc.mockClear();
    expect(
      await collectPaymentAction(
        HALLS.h1,
        INV,
        { method: "wallet", walletId: null, amount: { kind: "full" } },
        KEY,
      ),
    ).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed input before reading or writing anything", async () => {
    for (const bad of [
      { method: "card", walletId: null, amount: { kind: "full" } },
      { method: "cash", walletId: null, amount: { kind: "custom", text: "" } },
      { method: "cash", walletId: null, amount: { kind: "custom", text: "-5" } },
      { method: "cash", walletId: null, amount: { kind: "custom", text: "abc" } },
    ]) {
      expect(await collectPaymentAction(HALLS.h1, INV, bad as never, KEY)).toMatchObject({
        code: "VALIDATION",
      });
    }
    expect(
      await collectPaymentAction(
        HALLS.h1,
        "../x",
        { method: "cash", walletId: null, amount: { kind: "full" } },
        KEY,
      ),
    ).toMatchObject({ code: "VALIDATION" });
    expect(
      await collectPaymentAction(
        HALLS.h1,
        INV,
        { method: "cash", walletId: null, amount: { kind: "full" } },
        "nope",
      ),
    ).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("is refused to outsiders before any database call", async () => {
    for (const p of ["ownerH3", "salesAgent", "superAdmin", "customerOnly"] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(
        await collectPaymentAction(
          HALLS.h1,
          INV,
          { method: "cash", walletId: null, amount: { kind: "full" } },
          KEY,
        ),
      ).toMatchObject({ ok: false });
    }
    expect(listInvoices).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("passes database refusals through in plain language", async () => {
    rpc.mockResolvedValue({
      ok: false,
      code: "INSUFFICIENT_FUNDS",
      message: "The balance is not sufficient for this operation.",
    });
    const r = await collectPaymentAction(
      HALLS.h1,
      INV,
      { method: "wallet", walletId: WAL, amount: { kind: "full" } },
      KEY,
    );
    expect(r).toMatchObject({ ok: false, code: "INSUFFICIENT_FUNDS" });
  });
  it("reports a missing invoice as not found", async () => {
    listInvoices.mockResolvedValue({ rows: [], total: 0 });
    expect(
      await collectPaymentAction(
        HALLS.h1,
        INV,
        { method: "cash", walletId: null, amount: { kind: "full" } },
        KEY,
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("voidInvoiceAction", () => {
  it("needs payment.adjust: employees are refused, owners need a reason", async () => {
    expect(await voidInvoiceAction(HALLS.h1, INV, "mistake")).toMatchObject({ code: "FORBIDDEN" });
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    expect(await voidInvoiceAction(HALLS.h1, INV, "  ")).toMatchObject({ code: "VALIDATION" });
    rpc.mockResolvedValue({ ok: true, data: null });
    expect(await voidInvoiceAction(HALLS.h1, INV, "Entered by mistake")).toMatchObject({
      ok: true,
    });
    expect(rpc).toHaveBeenCalledWith("void_invoice", {
      p_invoice_id: INV,
      p_reason: "Entered by mistake",
    });
  });
});
