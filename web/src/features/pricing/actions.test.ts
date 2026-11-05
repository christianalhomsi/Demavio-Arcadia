import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/invoices/queries", () => ({ getHallCurrency: async () => "USD" }));

import { deleteRateAction, setRateAction } from "./actions";

const DEV = "44444444-0000-0000-0000-000000000001";
const RULE = "12121212-0000-4000-8000-000000000001";

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
  getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
  rpc.mockResolvedValue({ ok: true, data: RULE });
});

describe("pricing actions are owner-only", () => {
  it("employees, sales and other tenants are refused before the database", async () => {
    for (const p of ["employeeH1", "salesAgent", "ownerH3", "superAdmin"] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(
        await setRateAction(HALLS.h1, {
          scope: "hall",
          deviceId: null,
          category: null,
          rateText: "6",
        }),
      ).toMatchObject({ ok: false });
      expect(await deleteRateAction(HALLS.h1, RULE)).toMatchObject({ ok: false });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("setRateAction", () => {
  it("converts the typed rate to minor units server-side and sends only the relevant scope fields", async () => {
    await setRateAction(HALLS.h1, {
      scope: "hall",
      deviceId: DEV,
      category: "VIP",
      rateText: "6.00",
    });
    expect(rpc).toHaveBeenLastCalledWith("set_pricing_rate", {
      p_hall_id: HALLS.h1,
      p_scope: "hall",
      p_device_id: null,
      p_category: null,
      p_rate_minor: 600,
    });
    await setRateAction(HALLS.h1, {
      scope: "category",
      deviceId: null,
      category: "VIP",
      rateText: "9",
    });
    expect(rpc).toHaveBeenLastCalledWith(
      "set_pricing_rate",
      expect.objectContaining({ p_scope: "category", p_category: "VIP", p_rate_minor: 900 }),
    );
    await setRateAction(HALLS.h1, {
      scope: "device",
      deviceId: DEV,
      category: null,
      rateText: "12.5",
    });
    expect(rpc).toHaveBeenLastCalledWith(
      "set_pricing_rate",
      expect.objectContaining({ p_scope: "device", p_device_id: DEV, p_rate_minor: 1250 }),
    );
  });
  it("validates", async () => {
    const call = (over: object) =>
      setRateAction(HALLS.h1, {
        scope: "hall",
        deviceId: null,
        category: null,
        rateText: "6",
        ...over,
      });
    expect(await call({ rateText: "" })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ rateText: "-1" })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ rateText: "1.234" })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ scope: "category" })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ scope: "device", deviceId: "x" })).toMatchObject({ code: "VALIDATION" });
    expect(await call({ scope: "weekend" })).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
