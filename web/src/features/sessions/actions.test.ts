import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  convertToOpenAction,
  endSessionAction,
  extendSessionAction,
  startWalkInAction,
} from "./actions";

const DEV = "44444444-0000-0000-0000-000000000001";
const SES = "77777777-0000-4000-8000-000000000001";
const KEY = "55555555-0000-4000-8000-000000000001";

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
  getCtx.mockResolvedValue(PERSONAS.employeeH1);
  rpc.mockResolvedValue({ ok: true, data: SES });
});

describe("startWalkInAction", () => {
  it("sends fixed sessions with a duration and open sessions without one", async () => {
    await startWalkInAction(
      HALLS.h1,
      { deviceId: DEV, type: "fixed", durationMinutes: 45, guestName: "Sam" },
      KEY,
    );
    expect(rpc).toHaveBeenLastCalledWith(
      "start_walk_in",
      expect.objectContaining({ p_type: "fixed", p_duration_minutes: 45, p_key: KEY }),
    );
    await startWalkInAction(
      HALLS.h1,
      { deviceId: DEV, type: "open", durationMinutes: 45, guestName: "Sam" },
      KEY,
    );
    expect(rpc).toHaveBeenLastCalledWith(
      "start_walk_in",
      expect.objectContaining({ p_type: "open", p_duration_minutes: null }),
    );
  });
  it("validates locally", async () => {
    for (const bad of [
      { deviceId: DEV, type: "fixed" as const, durationMinutes: 2, guestName: "Sam" },
      { deviceId: DEV, type: "fixed" as const, durationMinutes: null, guestName: "Sam" },
      { deviceId: DEV, type: "open" as const, durationMinutes: null, guestName: "" },
      { deviceId: "x", type: "open" as const, durationMinutes: null, guestName: "Sam" },
    ]) {
      expect(await startWalkInAction(HALLS.h1, bad, KEY)).toMatchObject({ code: "VALIDATION" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("is refused for other tenants and sales", async () => {
    for (const p of ["ownerH3", "salesAgent", "customerOnly"] as const) {
      getCtx.mockResolvedValue(PERSONAS[p]);
      expect(
        await startWalkInAction(
          HALLS.h1,
          { deviceId: DEV, type: "open", durationMinutes: null, guestName: "Sam" },
          KEY,
        ),
      ).toMatchObject({ ok: false });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("endSessionAction", () => {
  it("reports the recorded duration and never mentions payment state", async () => {
    rpc.mockResolvedValue({ ok: true, data: 1500 });
    const r = await endSessionAction(HALLS.h1, SES, "normal", "");
    expect(r).toEqual({ ok: true, data: { billableSeconds: 1500 } });
    expect(rpc).toHaveBeenCalledWith("end_session", {
      p_id: SES,
      p_end_type: "normal",
      p_reason: null,
    });
  });
  it("requires a reason unless the end is normal, and rejects unknown end types", async () => {
    expect(await endSessionAction(HALLS.h1, SES, "interrupted", " ")).toMatchObject({
      code: "VALIDATION",
    });
    expect(await endSessionAction(HALLS.h1, SES, "deleted" as never, "x")).toMatchObject({
      code: "VALIDATION",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("extendSessionAction", () => {
  it("sends minutes, reason and the idempotency key", async () => {
    rpc.mockResolvedValue({ ok: true, data: "2026-11-01T12:00:00Z" });
    const r = await extendSessionAction(
      HALLS.h1,
      SES,
      { minutes: 15, reason: "Customer asked" },
      KEY,
    );
    expect(r).toEqual({ ok: true, data: { newEnd: "2026-11-01T12:00:00Z" } });
    expect(rpc).toHaveBeenCalledWith("extend_session", {
      p_id: SES,
      p_minutes: 15,
      p_reason: "Customer asked",
      p_key: KEY,
    });
  });
  it("validates locally and shows a conflict clearly", async () => {
    expect(
      await extendSessionAction(HALLS.h1, SES, { minutes: 0, reason: "x" }, KEY),
    ).toMatchObject({ code: "VALIDATION" });
    expect(
      await extendSessionAction(HALLS.h1, SES, { minutes: 5, reason: " " }, KEY),
    ).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({
      ok: false,
      code: "CONFLICT",
      message: "That time overlaps another reservation or session on this device.",
    });
    expect(
      await extendSessionAction(HALLS.h1, SES, { minutes: 5, reason: "x" }, KEY),
    ).toMatchObject({ ok: false, code: "CONFLICT" });
  });
});

describe("convertToOpenAction", () => {
  it("needs a reason", async () => {
    expect(await convertToOpenAction(HALLS.h1, SES, " ")).toMatchObject({ code: "VALIDATION" });
    rpc.mockResolvedValue({ ok: true, data: null });
    expect(await convertToOpenAction(HALLS.h1, SES, "staying")).toMatchObject({ ok: true });
  });
});
