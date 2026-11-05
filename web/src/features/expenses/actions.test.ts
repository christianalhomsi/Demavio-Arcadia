import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
const upload = vi.fn();
const remove = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/invoices/queries", () => ({ getHallCurrency: async () => "USD" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    storage: { from: () => ({ upload, remove, createSignedUrl: vi.fn() }) },
  }),
}));

import {
  createExpenseAction,
  uploadReceiptAction,
  voidExpenseAction,
  type ExpenseInput,
} from "./actions";

const ID = "55555555-0000-4000-8000-000000000001";
const KEY = "88888888-0000-4000-8000-000000000001";
const input: ExpenseInput = {
  category: "rent",
  amountText: "50.25",
  spentOn: "2026-03-01",
  paidWith: "bank",
  description: " March ",
};

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
  upload.mockReset();
  remove.mockReset();
  getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
  rpc.mockResolvedValue({ ok: true, data: ID });
  upload.mockResolvedValue({ error: null });
});

const file = (type: string, size = 10) => {
  const f = new File([new Uint8Array(size)], "r", { type });
  const form = new FormData();
  form.set("file", f);
  return form;
};

describe("expenses are owner-only", () => {
  it("refuses everyone else before touching the database or storage", async () => {
    for (const p of ["employeeH1", "salesAgent", "ownerH3", "superAdmin"] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(await createExpenseAction(HALLS.h1, input, KEY)).toMatchObject({ ok: false });
      expect(await voidExpenseAction(HALLS.h1, ID, "Entered twice")).toMatchObject({ ok: false });
      expect(await uploadReceiptAction(HALLS.h1, ID, file("application/pdf"))).toMatchObject({
        ok: false,
      });
    }
    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("create and void", () => {
  it("sends minor units and a trimmed description", async () => {
    await createExpenseAction(HALLS.h1, input, KEY);
    expect(rpc).toHaveBeenLastCalledWith("create_expense", {
      p_hall_id: HALLS.h1,
      p_category: "rent",
      p_amount_minor: 5025,
      p_spent_on: "2026-03-01",
      p_paid_with: "bank",
      p_description: "March",
      p_key: KEY,
    });
  });
  it("validates locally", async () => {
    for (const bad of [
      { amountText: "abc" },
      { amountText: "0" },
      { spentOn: "2026-02-30" },
      { spentOn: "" },
      { description: "x".repeat(301) },
      { category: "party" as never },
    ]) {
      expect(await createExpenseAction(HALLS.h1, { ...input, ...bad }, KEY)).toMatchObject({
        ok: false,
      });
    }
    expect(await createExpenseAction(HALLS.h1, input, "bad")).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("needs a reason to void", async () => {
    expect(await voidExpenseAction(HALLS.h1, ID, "ab")).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("receipt upload", () => {
  it("stores the file under hall/expense and then links it", async () => {
    expect(await uploadReceiptAction(HALLS.h1, ID, file("image/png"))).toMatchObject({ ok: true });
    const path = upload.mock.calls[0]![0] as string;
    expect(path).toMatch(new RegExp(`^${HALLS.h1}/${ID}/[0-9a-f-]{36}\\.png$`));
    expect(rpc).toHaveBeenLastCalledWith("attach_expense_receipt", { p_id: ID, p_path: path });
  });
  it("refuses other types, empty files and files over 5 MB before storage", async () => {
    for (const f of [
      file("text/html"),
      file("image/svg+xml"),
      file("image/png", 0),
      file("image/png", 5 * 1024 * 1024 + 1),
    ]) {
      expect(await uploadReceiptAction(HALLS.h1, ID, f)).toMatchObject({ ok: false });
    }
    expect(await uploadReceiptAction(HALLS.h1, ID, new FormData())).toMatchObject({ ok: false });
    expect(upload).not.toHaveBeenCalled();
  });
  it("removes the file again when the database refuses the link", async () => {
    rpc.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "no" });
    expect(await uploadReceiptAction(HALLS.h1, ID, file("application/pdf"))).toMatchObject({
      ok: false,
    });
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it("reports a failed upload without linking anything", async () => {
    upload.mockResolvedValue({ error: { message: "boom" } });
    expect(await uploadReceiptAction(HALLS.h1, ID, file("image/jpeg"))).toMatchObject({
      ok: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
