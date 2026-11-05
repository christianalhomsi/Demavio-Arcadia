import { beforeEach, describe, expect, it, vi } from "vitest";
import { PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { submitHallRequestAction } from "./actions";

const ID = "99999999-0000-4000-8000-000000000001";
const request = {
  hallName: " Hall One ",
  currency: "usd",
  ownerEmail: "owner@example.com",
  ownerUsername: "Owner_1",
  ownerPassword: "password1",
};

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
  getCtx.mockResolvedValue(PERSONAS.salesAgent);
  rpc.mockResolvedValue({ ok: true, data: ID });
});

describe("submitHallRequestAction", () => {
  it("refuses anyone outside sales", async () => {
    for (const p of [
      "ownerH1H2",
      "employeeH1",
      "superAdmin",
      "customerOnly",
      "deactivated",
    ] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(await submitHallRequestAction(request), p).toMatchObject({ code: "FORBIDDEN" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends a request with no lead, normalized", async () => {
    expect(await submitHallRequestAction(request)).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith("submit_hall_request", {
      p_hall_name: "Hall One",
      p_currency: "USD",
      p_owner_email: "owner@example.com",
      p_owner_username: "owner_1",
      p_owner_password: "password1",
      p_plan_id: null,
    });
  });

  it("sends the subscription the customer asked for and refuses a malformed one", async () => {
    const PLAN = "77777777-0000-4000-8000-000000000001";
    await submitHallRequestAction({ ...request, planId: PLAN });
    expect(rpc).toHaveBeenCalledWith(
      "submit_hall_request",
      expect.objectContaining({ p_plan_id: PLAN }),
    );
    rpc.mockClear();
    expect(await submitHallRequestAction({ ...request, planId: "nope" })).toMatchObject({
      fieldErrors: { planId: expect.any(String) },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("validates locally", async () => {
    const r = await submitHallRequestAction({ ...request, ownerPassword: "short" });
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("puts a taken username on its field", async () => {
    rpc.mockResolvedValue({ ok: false, code: "CONFLICT", message: "username_taken" });
    const r = await submitHallRequestAction(request);
    expect(r).toMatchObject({
      code: "VALIDATION",
      fieldErrors: { ownerUsername: "username_taken" },
    });
  });
});
