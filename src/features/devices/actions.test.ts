import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  endMaintenanceAction,
  requestCommandAction,
  startMaintenanceAction,
  upsertDeviceAction,
} from "./actions";
import type { StaffCommand } from "./schemas";

const DEV = "44444444-0000-0000-0000-000000000001";
const KEY = "55555555-0000-4000-8000-000000000001";

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
  rpc.mockResolvedValue({ ok: true, data: DEV });
});

const device = {
  name: "PC-09",
  deviceType: "pc" as const,
  category: "",
  capabilities: ["lock" as const],
  status: "active" as const,
};

describe("upsertDeviceAction", () => {
  it("is owner-only", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    expect(await upsertDeviceAction(HALLS.h1, null, device)).toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("maps fields to the RPC and returns the new id", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    expect(await upsertDeviceAction(HALLS.h1, null, device)).toEqual({
      ok: true,
      data: { id: DEV },
    });
    expect(rpc).toHaveBeenCalledWith("upsert_device", {
      p_hall_id: HALLS.h1,
      p_device_id: null,
      p_name: "PC-09",
      p_type: "pc",
      p_category: "",
      p_capabilities: ["lock"],
      p_status: "active",
    });
  });
  it("validates locally and shows a friendly duplicate-name error", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    expect(await upsertDeviceAction(HALLS.h1, null, { ...device, name: " " })).toMatchObject({
      code: "VALIDATION",
    });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ ok: false, code: "CONFLICT", message: "x" });
    expect(await upsertDeviceAction(HALLS.h1, null, device)).toMatchObject({
      ok: false,
      fieldErrors: { name: expect.stringContaining("already exists") },
    });
  });
});

describe("maintenance actions", () => {
  it("employees with device.control may start and end maintenance", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    rpc.mockResolvedValue({ ok: true, data: null });
    expect(
      await startMaintenanceAction(HALLS.h1, DEV, { reason: "Fan", expectedEnd: "" }),
    ).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("start_maintenance", {
      p_device_id: DEV,
      p_reason: "Fan",
      p_expected_end: null,
    });
    expect(await endMaintenanceAction(HALLS.h1, "m1")).toMatchObject({ ok: true });
  });
  it("requires a reason and a valid end time", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    expect(
      await startMaintenanceAction(HALLS.h1, DEV, { reason: " ", expectedEnd: "" }),
    ).toMatchObject({ code: "VALIDATION" });
    expect(
      await startMaintenanceAction(HALLS.h1, DEV, { reason: "x", expectedEnd: "not a date" }),
    ).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("other tenants are refused before reaching the backend", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH3);
    expect(
      await startMaintenanceAction(HALLS.h1, DEV, { reason: "x", expectedEnd: "" }),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("requestCommandAction", () => {
  it("sends only the type and idempotency key; success means recorded", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    rpc.mockResolvedValue({ ok: true, data: "cmd-1" });
    expect(await requestCommandAction(HALLS.h1, DEV, "LOCK", KEY)).toEqual({
      ok: true,
      data: { commandId: "cmd-1" },
    });
    expect(rpc).toHaveBeenCalledWith("request_device_command", {
      p_device_id: DEV,
      p_type: "LOCK",
      p_key: KEY,
    });
  });
  it("rejects unknown command types and malformed ids before the backend", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    for (const t of ["START_SESSION", "rm -rf /", "lock"]) {
      expect(await requestCommandAction(HALLS.h1, DEV, t as StaffCommand, KEY)).toMatchObject({
        code: "VALIDATION",
      });
    }
    expect(await requestCommandAction(HALLS.h1, "../x", "LOCK", KEY)).toMatchObject({
      code: "VALIDATION",
    });
    expect(await requestCommandAction(HALLS.h1, DEV, "LOCK", "nope")).toMatchObject({
      code: "VALIDATION",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("is refused for users without device.control and for sales/super admin", async () => {
    for (const p of ["salesAgent", "superAdmin", "customerOnly"] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(await requestCommandAction(HALLS.h1, DEV, "LOCK", KEY)).toMatchObject({ ok: false });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("explains backend refusals in plain language", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    rpc.mockResolvedValue({
      ok: false,
      code: "PRECONDITION_FAILED",
      message: "This device has no Agent installed, so it can't receive commands.",
    });
    expect(await requestCommandAction(HALLS.h1, DEV, "LOCK", KEY)).toMatchObject({
      message: expect.stringContaining("no Agent"),
    });
  });
});
