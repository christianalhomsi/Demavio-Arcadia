import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { setWorkingHoursAction, updateHallProfileAction, updatePoliciesAction } from "./actions";

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
  rpc.mockResolvedValue({ ok: true, data: null });
});

const profile = { name: "Hall", address: "", contactPhone: "", timeZone: "UTC" };
const policies = {
  checkinGraceMinutes: 10,
  cancellationDeadlineMinutes: 60,
  reminderMinutes: 15,
  waitingListEnabled: false,
  allowPartialPayments: false,
  paymentMethods: ["cash" as const],
};

describe("hall settings actions", () => {
  it("employees are refused before any backend call", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    expect(await updateHallProfileAction(HALLS.h1, profile)).toMatchObject({ code: "FORBIDDEN" });
    expect(await updatePoliciesAction(HALLS.h1, policies)).toMatchObject({ code: "FORBIDDEN" });
    expect(await setWorkingHoursAction(HALLS.h1, [])).toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("owners of another hall cannot touch this one", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH3);
    expect(await updateHallProfileAction(HALLS.h1, profile)).toMatchObject({ code: "NOT_FOUND" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("maps policy fields to RPC parameters", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    await updatePoliciesAction(HALLS.h1, policies);
    expect(rpc).toHaveBeenCalledWith("update_hall_policies", {
      p_hall_id: HALLS.h1,
      p_checkin_grace_minutes: 10,
      p_cancellation_deadline_minutes: 60,
      p_reminder_minutes: 15,
      p_waiting_list_enabled: false,
      p_allow_partial_payments: false,
      p_payment_methods: ["cash"],
    });
  });
  it("returns field errors for invalid input without calling the backend", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    const r = await updateHallProfileAction(HALLS.h1, { ...profile, name: "" });
    expect(r).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: { name: expect.any(String) },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects overlapping hours locally", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    const r = await setWorkingHoursAction(HALLS.h1, [
      { weekday: 1, opens: "09:00", closes: "12:00" },
      { weekday: 1, opens: "11:00", closes: "13:00" },
    ]);
    expect(r).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
