import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  cancelReservationAction,
  checkInReservationAction,
  createReservationAction,
} from "./actions";

const DEV = "44444444-0000-0000-0000-000000000001";
const RES = "66666666-0000-4000-8000-000000000001";
const KEY = "55555555-0000-4000-8000-000000000001";
const input = {
  deviceId: DEV,
  guestName: "Sam",
  startAt: "2026-11-01T10:00:00.000Z",
  endAt: "2026-11-01T11:00:00.000Z",
};

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
  rpc.mockResolvedValue({ ok: true, data: RES });
});

describe("createReservationAction", () => {
  it("passes a validated request to the database, which decides availability", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    expect(await createReservationAction(HALLS.h1, input, KEY)).toEqual({
      ok: true,
      data: { id: RES },
    });
    expect(rpc).toHaveBeenCalledWith("create_reservation", {
      p_hall_id: HALLS.h1,
      p_device_id: DEV,
      p_customer_id: null,
      p_guest_name: "Sam",
      p_start: input.startAt,
      p_end: input.endAt,
      p_key: KEY,
    });
  });
  it("surfaces database conflicts in plain language", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    rpc.mockResolvedValue({
      ok: false,
      code: "CONFLICT",
      message: "That time overlaps another reservation or session on this device.",
    });
    expect(await createReservationAction(HALLS.h1, input, KEY)).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
  });
  it("rejects bad input before the backend (times, name, ids)", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    for (const bad of [
      { ...input, guestName: " " },
      { ...input, endAt: input.startAt },
      { ...input, endAt: "2026-11-03T10:00:00.000Z" },
      { ...input, startAt: "garbage" },
      { ...input, deviceId: "not-a-uuid" },
    ]) {
      expect(await createReservationAction(HALLS.h1, bad, KEY)).toMatchObject({
        code: "VALIDATION",
      });
    }
    expect(await createReservationAction(HALLS.h1, input, "bad-key")).toMatchObject({
      code: "VALIDATION",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("is refused for outsiders before the backend", async () => {
    for (const p of [
      "ownerH3",
      "salesAgent",
      "superAdmin",
      "customerOnly",
      "deactivated",
    ] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(await createReservationAction(HALLS.h1, input, KEY)).toMatchObject({ ok: false });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("cancelReservationAction", () => {
  it("requires a reason", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    expect(await cancelReservationAction(HALLS.h1, RES, "  ")).toMatchObject({
      code: "VALIDATION",
    });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ ok: true, data: null });
    expect(await cancelReservationAction(HALLS.h1, RES, "Customer called")).toMatchObject({
      ok: true,
    });
    expect(rpc).toHaveBeenCalledWith("cancel_reservation", {
      p_id: RES,
      p_reason: "Customer called",
    });
  });
});

describe("checkInReservationAction", () => {
  it("returns the new session and sends no override reason by default", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    rpc.mockResolvedValue({ ok: true, data: "sess-1" });
    expect(await checkInReservationAction(HALLS.h1, RES)).toEqual({
      ok: true,
      data: { sessionId: "sess-1" },
    });
    expect(rpc).toHaveBeenCalledWith("check_in_reservation", {
      p_id: RES,
      p_override_reason: null,
    });
  });
  it("forwards a late-override reason; the database decides whether it is allowed", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    rpc.mockResolvedValue({
      ok: false,
      code: "FORBIDDEN",
      message: "Only an owner can check in after the grace period.",
    });
    const r = await checkInReservationAction(HALLS.h1, RES, "traffic");
    expect(rpc).toHaveBeenCalledWith("check_in_reservation", {
      p_id: RES,
      p_override_reason: "traffic",
    });
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("owner") });
  });
  it("rejects malformed reservation ids", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    expect(await checkInReservationAction(HALLS.h1, "../x")).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
