import { beforeEach, describe, expect, it, vi } from "vitest";
import { HALLS, PERSONAS } from "../../../tests/authz/personas";

const rpc = vi.fn();
const getCtx = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createPairingCodeAction, revokeHallServerAction } from "./actions";

const SERVER = "66666666-0000-4000-8000-000000000001";

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
});

describe("createPairingCodeAction", () => {
  it("is owner-only: an employee is refused before any RPC", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    expect(await createPairingCodeAction(HALLS.h1, "agent")).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("an owner of another hall cannot create a code for this hall", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH3);
    expect(await createPairingCodeAction(HALLS.h1, "hall_server")).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the RPC row to the code and its expiry", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    rpc.mockResolvedValue({
      ok: true,
      data: [{ pairing_code: "A1B2-C3D4-E5F6", valid_until: "2026-11-05T15:00:00Z" }],
    });
    expect(await createPairingCodeAction(HALLS.h1, "agent")).toEqual({
      ok: true,
      data: { code: "A1B2-C3D4-E5F6", validUntil: "2026-11-05T15:00:00Z" },
    });
    expect(rpc).toHaveBeenCalledWith("create_pairing_code", {
      p_hall_id: HALLS.h1,
      p_kind: "agent",
    });
  });

  it("rejects an unknown kind locally", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    expect(await createPairingCodeAction(HALLS.h1, "root" as never)).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes backend failures through and treats an empty result as an error", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    rpc.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "no" });
    expect(await createPairingCodeAction(HALLS.h1, "agent")).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    rpc.mockResolvedValue({ ok: true, data: [] });
    expect(await createPairingCodeAction(HALLS.h1, "agent")).toMatchObject({ ok: false });
  });
});

describe("revokeHallServerAction", () => {
  it("is owner-only and validates the id", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    expect(await revokeHallServerAction(HALLS.h1, SERVER)).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    expect(await revokeHallServerAction(HALLS.h1, "not-a-uuid")).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the RPC for an owner", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    rpc.mockResolvedValue({ ok: true, data: null });
    expect(await revokeHallServerAction(HALLS.h1, SERVER)).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith("revoke_hall_server", { p_hall_server_id: SERVER });
  });
});
