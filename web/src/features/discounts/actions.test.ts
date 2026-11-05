import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/invoices/queries", () => ({ getHallCurrency: async () => "USD" }));
vi.mock("@/features/packages/queries", () => ({ listPackageUses: async () => [] }));

import { upsertPackageAction, startPackageSessionAction } from "@/features/packages/actions";
import { deleteWindowAction, upsertWindowAction } from "@/features/pricing/windowActions";
import { applyDiscountAction, upsertDiscountAction } from "./actions";
import { basisPointsToPercent, percentToBasisPoints } from "./schemas";

const ID = "55555555-0000-4000-8000-000000000001";
const INV = "66666666-0000-4000-8000-000000000001";
const KEY = "88888888-0000-4000-8000-000000000001";

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
  getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
  rpc.mockResolvedValue({ ok: true, data: ID });
});

describe("percent helpers", () => {
  it("converts to and from basis points", () => {
    expect(percentToBasisPoints("10")).toBe(1000);
    expect(percentToBasisPoints("12.5")).toBe(1250);
    expect(percentToBasisPoints("0.01")).toBe(1);
    expect(percentToBasisPoints("100")).toBe(10000);
    for (const bad of ["0", "100.01", "101", "-1", "abc", "1.234", ""]) {
      expect(percentToBasisPoints(bad)).toBeNull();
    }
    expect(basisPointsToPercent(1250)).toBe("12.5");
  });
});

describe("discount definitions are owner-only", () => {
  const input = {
    name: "Ten",
    kind: "percent" as const,
    valueText: "10",
    validFrom: "",
    validUntil: "",
    maxUses: "",
    active: true,
  };
  it("refuses employees and outsiders before the database", async () => {
    for (const p of ["employeeH1", "salesAgent", "ownerH3", "superAdmin"] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(await upsertDiscountAction(HALLS.h1, null, input)).toMatchObject({ ok: false });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("sends basis points for percent and minor units for amounts", async () => {
    await upsertDiscountAction(HALLS.h1, null, { ...input, valueText: "12.5", maxUses: "3" });
    expect(rpc).toHaveBeenLastCalledWith(
      "upsert_discount",
      expect.objectContaining({ p_kind: "percent", p_value: 1250, p_max_uses: 3 }),
    );
    await upsertDiscountAction(HALLS.h1, null, { ...input, kind: "amount", valueText: "2.50" });
    expect(rpc).toHaveBeenLastCalledWith(
      "upsert_discount",
      expect.objectContaining({ p_kind: "amount", p_value: 250 }),
    );
  });
  it("validates locally", async () => {
    for (const bad of [
      { name: "" },
      { valueText: "150" },
      { valueText: "abc" },
      { validFrom: "2026-13-40" },
      { maxUses: "0" },
    ]) {
      expect(await upsertDiscountAction(HALLS.h1, null, { ...input, ...bad })).toMatchObject({
        ok: false,
      });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("applying a discount", () => {
  it("lets owners and employees try; the database enforces the limit", async () => {
    for (const p of ["ownerH1H2", "employeeH1"] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(
        await applyDiscountAction(HALLS.h1, INV, { discountId: ID, reason: "Regular" }, KEY),
      ).toMatchObject({ ok: true });
    }
    expect(rpc).toHaveBeenLastCalledWith("apply_discount", {
      p_invoice_id: INV,
      p_discount_id: ID,
      p_reason: "Regular",
      p_key: KEY,
    });
  });
  it("never sends an amount, and refuses outsiders and bad input", async () => {
    await applyDiscountAction(HALLS.h1, INV, { discountId: ID, reason: "Regular" }, KEY);
    expect(Object.keys(rpc.mock.calls[0]![1])).not.toContain("p_amount_minor");
    rpc.mockClear();
    for (const p of ["salesAgent", "ownerH3", "superAdmin"] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(
        await applyDiscountAction(HALLS.h1, INV, { discountId: ID, reason: "x" }, KEY),
      ).toMatchObject({ ok: false });
    }
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    expect(
      await applyDiscountAction(HALLS.h1, INV, { discountId: ID, reason: " " }, KEY),
    ).toMatchObject({ ok: false });
    expect(
      await applyDiscountAction(HALLS.h1, "x", { discountId: ID, reason: "ok" }, KEY),
    ).toMatchObject({ ok: false });
    expect(
      await applyDiscountAction(HALLS.h1, INV, { discountId: ID, reason: "ok" }, "bad"),
    ).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("packages", () => {
  const input = {
    name: "3h",
    durationMinutes: 180,
    priceText: "5",
    target: "",
    from: "",
    to: "",
    validFrom: "",
    validUntil: "",
    maxUses: "",
    active: true,
  };
  it("is owner-only to manage", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    expect(await upsertPackageAction(HALLS.h1, null, input)).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("converts price, time of day, validity and target", async () => {
    await upsertPackageAction(HALLS.h1, null, {
      ...input,
      target: `device:${ID}`,
      from: "18:00",
      to: "24:00",
      validFrom: "2026-01-01",
      validUntil: "2026-01-31",
      maxUses: "10",
    });
    expect(rpc).toHaveBeenLastCalledWith(
      "upsert_package",
      expect.objectContaining({
        p_price_minor: 500,
        p_device_id: ID,
        p_category: null,
        p_from_minute: 1080,
        p_to_minute: 1440,
        p_valid_from: "2026-01-01T00:00:00.000Z",
        p_valid_until: "2026-02-01T00:00:00.000Z",
        p_max_uses: 10,
      }),
    );
  });
  it("rejects half a time range and bad numbers", async () => {
    for (const bad of [
      { from: "18:00" },
      { from: "20:00", to: "19:00" },
      { durationMinutes: 4 },
      { priceText: "x" },
    ]) {
      expect(await upsertPackageAction(HALLS.h1, null, { ...input, ...bad })).toMatchObject({
        ok: false,
      });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("starting a package session needs session.start and sends no price", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    await startPackageSessionAction(
      HALLS.h1,
      { packageId: ID, deviceId: ID, guestName: " Sam " },
      KEY,
    );
    expect(rpc).toHaveBeenLastCalledWith("start_package_session", {
      p_hall_id: HALLS.h1,
      p_package_id: ID,
      p_device_id: ID,
      p_customer_id: null,
      p_guest_name: "Sam",
      p_key: KEY,
    });
    rpc.mockClear();
    getCtx.mockResolvedValue(PERSONAS.salesAgent);
    expect(
      await startPackageSessionAction(
        HALLS.h1,
        { packageId: ID, deviceId: ID, guestName: "x" },
        KEY,
      ),
    ).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("pricing windows", () => {
  const input = { target: "hall", days: [1, 2], from: "18:00", to: "24:00", rateText: "9" };
  it("is owner-only", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    expect(await upsertWindowAction(HALLS.h1, null, input)).toMatchObject({ ok: false });
    expect(await deleteWindowAction(HALLS.h1, ID)).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("sends minutes, sorted unique days and minor units", async () => {
    await upsertWindowAction(HALLS.h1, null, { ...input, days: [3, 1, 3] });
    expect(rpc).toHaveBeenLastCalledWith("upsert_pricing_window", {
      p_hall_id: HALLS.h1,
      p_id: null,
      p_scope: "hall",
      p_device_id: null,
      p_category: null,
      p_days: [1, 3],
      p_start: 1080,
      p_end: 1440,
      p_rate_minor: 900,
    });
  });
  it("rejects empty days, bad ranges and bad targets locally", async () => {
    for (const bad of [
      { days: [] },
      { days: [8] },
      { from: "20:00", to: "19:00" },
      { from: "25:00" },
      { target: "device:nope" },
      { target: "weekend" },
      { rateText: "x" },
    ]) {
      expect(await upsertWindowAction(HALLS.h1, null, { ...input, ...bad })).toMatchObject({
        ok: false,
      });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});
