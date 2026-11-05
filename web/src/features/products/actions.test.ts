import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/invoices/queries", () => ({ getHallCurrency: async () => "USD" }));

import { addSessionItemAction, removeSessionItemAction, upsertProductAction } from "./actions";

const PRODUCT = "55555555-0000-4000-8000-000000000001";
const SESSION = "66666666-0000-4000-8000-000000000001";
const ITEM = "77777777-0000-4000-8000-000000000001";
const KEY = "88888888-0000-4000-8000-000000000001";

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
  getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
  rpc.mockResolvedValue({ ok: true, data: PRODUCT });
});

describe("catalog changes are owner-only", () => {
  it("employees, sales and other tenants are refused before the database", async () => {
    for (const p of ["employeeH1", "salesAgent", "ownerH3", "superAdmin"] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(
        await upsertProductAction(HALLS.h1, null, {
          name: "Cola",
          priceText: "1.50",
          active: true,
        }),
      ).toMatchObject({ ok: false });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("converts the typed price to minor units and sends no hall-crossing data", async () => {
    await upsertProductAction(HALLS.h1, null, { name: "  Cola ", priceText: "1.5", active: true });
    expect(rpc).toHaveBeenLastCalledWith("upsert_product", {
      p_hall_id: HALLS.h1,
      p_id: null,
      p_name: "Cola",
      p_price_minor: 150,
      p_active: true,
    });
  });

  it("validates before calling the database", async () => {
    const call = (over: object) =>
      upsertProductAction(HALLS.h1, null, { name: "Cola", priceText: "1", active: true, ...over });
    expect(await call({ name: "" })).toMatchObject({
      ok: false,
      fieldErrors: { name: expect.any(String) },
    });
    expect(await call({ name: "x".repeat(61) })).toMatchObject({ ok: false });
    expect(await call({ priceText: "abc" })).toMatchObject({ ok: false });
    expect(await call({ priceText: "-1" })).toMatchObject({ ok: false });
    expect(
      await upsertProductAction(HALLS.h1, "not-a-uuid", {
        name: "Cola",
        priceText: "1",
        active: true,
      }),
    ).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("selling", () => {
  it("employees may add and remove items, outsiders and sales may not", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    rpc.mockResolvedValue({ ok: true, data: ITEM });
    expect(await addSessionItemAction(HALLS.h1, SESSION, PRODUCT, 2, KEY)).toMatchObject({
      ok: true,
    });
    expect(await removeSessionItemAction(HALLS.h1, SESSION, ITEM)).toMatchObject({ ok: true });

    rpc.mockClear();
    for (const p of ["salesAgent", "ownerH3", "superAdmin"] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(await addSessionItemAction(HALLS.h1, SESSION, PRODUCT, 1, KEY)).toMatchObject({
        ok: false,
      });
      expect(await removeSessionItemAction(HALLS.h1, SESSION, ITEM)).toMatchObject({ ok: false });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never sends a price: only the product, quantity and the idempotency key", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    await addSessionItemAction(HALLS.h1, SESSION, PRODUCT, 3, KEY);
    expect(rpc).toHaveBeenLastCalledWith("add_session_item", {
      p_session: SESSION,
      p_product: PRODUCT,
      p_quantity: 3,
      p_key: KEY,
    });
  });

  it("rejects bad ids and quantities locally", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    for (const q of [0, 100, 1.5, -2]) {
      expect(await addSessionItemAction(HALLS.h1, SESSION, PRODUCT, q, KEY)).toMatchObject({
        ok: false,
      });
    }
    expect(await addSessionItemAction(HALLS.h1, "x", PRODUCT, 1, KEY)).toMatchObject({ ok: false });
    expect(await addSessionItemAction(HALLS.h1, SESSION, PRODUCT, 1, "not-a-key")).toMatchObject({
      ok: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
