import { beforeEach, describe, expect, it, vi } from "vitest";
import { PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  assignPlatformRoleAction,
  createHallWithOwnerAction,
  saveSubscriptionPlanAction,
  setSalesManagerAction,
  inviteOwnerAction,
  revokePlatformRoleAction,
  setHallStatusAction,
  setUserStatusAction,
} from "./actions";

const ID = "99999999-0000-4000-8000-000000000001";
const KEY = "55555555-0000-4000-8000-000000000001";
const OWNER = { email: "owner@x.co", password: "secret123", username: "owner_x" };

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
  getCtx.mockResolvedValue(PERSONAS.superAdmin);
  rpc.mockResolvedValue({ ok: true, data: ID });
});

describe("platform actions are super-admin only", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["setSalesManager", () => setSalesManagerAction(ID, ID)],
    ["inviteOwner", () => inviteOwnerAction(ID, "a@b.co")],
    ["setHallStatus", () => setHallStatusAction(ID, "inactive", "because")],
    ["setUserStatus", () => setUserStatusAction(ID, "inactive", "because")],
  ];
  it("refuses every other persona before reaching the backend", async () => {
    for (const p of [
      "ownerH1H2",
      "employeeH1",
      "ownerH3",
      "salesAgent",
      "salesAdmin",
      "customerOnly",
      "deactivated",
    ] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      for (const [name, call] of calls)
        expect(await call(), `${p} ${name}`).toMatchObject({ ok: false, code: "FORBIDDEN" });
    }
    getCtx.mockResolvedValue(null);
    expect(
      await createHallWithOwnerAction({ ...OWNER, name: "H", currency: "USD" }, KEY),
    ).toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("lets the super admin through", async () => {
    for (const [name, call] of calls) expect(await call(), name).toMatchObject({ ok: true });
  });
  it("adding a hall directly is for super admins and sales managers only", async () => {
    const add = () => createHallWithOwnerAction({ ...OWNER, name: "H", currency: "USD" }, KEY);
    getCtx.mockResolvedValue(PERSONAS.salesAgent);
    expect(await add()).toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
    getCtx.mockResolvedValue(PERSONAS.salesAdmin);
    expect(await add()).toMatchObject({ ok: true });
  });
});

describe("createHallWithOwnerAction", () => {
  const make = (over: object = {}, key = KEY) =>
    createHallWithOwnerAction({ ...OWNER, name: "H", currency: "USD", ...over }, key);
  it("validates locally", async () => {
    expect(await make({ name: " " })).toMatchObject({ code: "VALIDATION" });
    expect(await make({ name: "x".repeat(121) })).toMatchObject({ code: "VALIDATION" });
    expect(await make({}, "bad")).toMatchObject({ code: "VALIDATION" });
    expect(await make({ currency: "us" })).toMatchObject({ code: "VALIDATION" });
    expect(await make({ currency: "EUR" })).toMatchObject({ code: "VALIDATION" });
    expect(await make({ email: "nope" })).toMatchObject({ code: "VALIDATION" });
    expect(await make({ password: "short" })).toMatchObject({ code: "VALIDATION" });
    expect(await make({ username: "a b" })).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("sends trimmed values, the upper-cased currency and the key; the zone is not a parameter", async () => {
    await make({ name: "  Nova  ", currency: "syp", email: " o@x.co " });
    expect(rpc).toHaveBeenCalledWith("admin_create_hall_with_owner", {
      p_hall_name: "Nova",
      p_currency: "SYP",
      p_email: "o@x.co",
      p_password: "secret123",
      p_username: "owner_x",
      p_key: KEY,
      p_plan_id: null,
    });
  });
  it("passes the chosen subscription and refuses a malformed one", async () => {
    const PLAN = "77777777-0000-4000-8000-000000000001";
    await make({ planId: PLAN });
    expect(rpc).toHaveBeenCalledWith(
      "admin_create_hall_with_owner",
      expect.objectContaining({ p_plan_id: PLAN }),
    );
    rpc.mockClear();
    expect(await make({ planId: "nope" })).toMatchObject({
      fieldErrors: { planId: expect.any(String) },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("surfaces a taken email or username on its field", async () => {
    rpc.mockResolvedValue({
      ok: false,
      code: "CONFLICT",
      message: "That username is already taken.",
    });
    expect(await make()).toMatchObject({ fieldErrors: { username: expect.any(String) } });
    rpc.mockResolvedValue({
      ok: false,
      code: "CONFLICT",
      message: "An account with this email already exists.",
    });
    expect(await make()).toMatchObject({ fieldErrors: { email: expect.any(String) } });
  });
});

describe("inviteOwnerAction", () => {
  it("returns the one-time token", async () => {
    rpc.mockResolvedValue({ ok: true, data: "tok" });
    expect(await inviteOwnerAction(ID, " a@b.co ")).toEqual({ ok: true, data: { token: "tok" } });
    expect(rpc).toHaveBeenCalledWith("admin_invite_owner", { p_hall_id: ID, p_email: "a@b.co" });
  });
  it("rejects a bad email locally", async () => {
    expect(await inviteOwnerAction(ID, "nope")).toMatchObject({ code: "VALIDATION" });
  });
});

describe("status changes need a reason", () => {
  it("rejects short reasons and bad statuses locally; sends the trimmed reason", async () => {
    expect(await setHallStatusAction(ID, "inactive", "no")).toMatchObject({ code: "VALIDATION" });
    expect(await setHallStatusAction(ID, "paused", "good reason")).toMatchObject({
      code: "VALIDATION",
    });
    expect(rpc).not.toHaveBeenCalled();
    await setHallStatusAction(ID, "inactive", "  Contract ended ");
    expect(rpc).toHaveBeenCalledWith("admin_set_hall_status", {
      p_hall_id: ID,
      p_status: "inactive",
      p_reason: "Contract ended",
    });
    await setUserStatusAction(ID, "inactive", "Left the company");
    expect(rpc).toHaveBeenLastCalledWith("admin_set_user_status", {
      p_user_id: ID,
      p_status: "inactive",
      p_reason: "Left the company",
    });
  });
});

describe("platform role actions", () => {
  it("sales admins may use them (the database limits them to sales_agent); others may not", async () => {
    getCtx.mockResolvedValue(PERSONAS.salesAdmin);
    rpc.mockResolvedValue({ ok: true, data: null });
    expect(await assignPlatformRoleAction("a@b.co", "sales_agent")).toMatchObject({ ok: true });
    expect(await revokePlatformRoleAction(ID, "sales_agent")).toMatchObject({ ok: true });
    for (const p of ["salesAgent", "ownerH1H2", "customerOnly"] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(await assignPlatformRoleAction("a@b.co", "sales_agent")).toMatchObject({
        code: "FORBIDDEN",
      });
      expect(await revokePlatformRoleAction(ID, "sales_agent")).toMatchObject({
        code: "FORBIDDEN",
      });
    }
  });
  it("validates role and email, and does not reveal which emails exist", async () => {
    expect(await assignPlatformRoleAction("a@b.co", "owner")).toMatchObject({ code: "VALIDATION" });
    expect(await assignPlatformRoleAction("bad", "sales_agent")).toMatchObject({
      code: "VALIDATION",
    });
    rpc.mockResolvedValue({
      ok: false,
      code: "NOT_FOUND",
      message: "That item could not be found.",
    });
    const r = await assignPlatformRoleAction("ghost@b.co", "sales_agent");
    expect(r).toMatchObject({
      code: "VALIDATION",
      fieldErrors: { email: expect.stringContaining("create an account") },
    });
  });
});

describe("saveSubscriptionPlanAction", () => {
  const plan = {
    period: "monthly",
    name: " Pro ",
    details: " 2 devices\nSupport ",
    currency: "usd",
    price: "25.50",
  };
  it("is super-admin only", async () => {
    getCtx.mockResolvedValue(PERSONAS.salesAdmin);
    expect(await saveSubscriptionPlanAction("", plan, KEY)).toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("sends the fixed period, trimmed text and the price in minor units", async () => {
    await saveSubscriptionPlanAction("", plan, KEY);
    expect(rpc).toHaveBeenCalledWith("admin_save_subscription_plan", {
      p_id: null,
      p_period: "monthly",
      p_name: "Pro",
      p_details: "2 devices\nSupport",
      p_price_minor: 2550,
      p_currency: "USD",
      p_key: KEY,
    });
  });
  it("refuses a period that is not on the list, a bad price and an over-long text", async () => {
    for (const over of [{ period: "weekly" }, { price: "abc" }, { details: "x".repeat(1001) }]) {
      expect(await saveSubscriptionPlanAction("", { ...plan, ...over }, KEY)).toMatchObject({
        code: "VALIDATION",
      });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("accepts an empty name and details, and edits without a key", async () => {
    await saveSubscriptionPlanAction(ID, { ...plan, name: "", details: "" }, "");
    expect(rpc).toHaveBeenCalledWith(
      "admin_save_subscription_plan",
      expect.objectContaining({ p_id: ID, p_name: "", p_details: null, p_key: null }),
    );
  });
});
