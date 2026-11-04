import { beforeEach, describe, expect, it, vi } from "vitest";
import { PERSONAS, HALLS } from "../../../tests/authz/personas";

// Mock the I/O boundaries: session context, RPC transport and cache revalidation.
const rpc = vi.fn();
const getCtx = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getMyContext: () => getCtx() }));
vi.mock("@/lib/actions/rpc", () => ({ callRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  acceptInvitationAction,
  inviteMemberAction,
  setMemberStatusAction,
  updateMemberAction,
} from "./actions";

beforeEach(() => {
  rpc.mockReset();
  getCtx.mockReset();
});

describe("inviteMemberAction", () => {
  it("never reaches the backend for users without employee.manage", async () => {
    getCtx.mockResolvedValue(PERSONAS.employeeH1);
    const r = await inviteMemberAction(HALLS.h1, { email: "a@b.test", role: "employee" });
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("hides other tenants' halls (NOT_FOUND)", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH3);
    expect(
      await inviteMemberAction(HALLS.h1, { email: "a@b.test", role: "employee" }),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects anonymous callers", async () => {
    getCtx.mockResolvedValue(null);
    expect(
      await inviteMemberAction(HALLS.h1, { email: "a@b.test", role: "employee" }),
    ).toMatchObject({ code: "UNAUTHENTICATED" });
  });
  it("validates input before calling the backend", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    const r = await inviteMemberAction(HALLS.h1, { email: "not-an-email", role: "employee" });
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("returns the one-time token from the backend", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    rpc.mockResolvedValue({ ok: true, data: "tok123" });
    const r = await inviteMemberAction(HALLS.h1, { email: "a@b.test", role: "employee" });
    expect(r).toEqual({ ok: true, data: { token: "tok123" } });
    expect(rpc).toHaveBeenCalledWith("invite_member", {
      p_hall_id: HALLS.h1,
      p_email: "a@b.test",
      p_role: "employee",
    });
  });
});

describe("updateMemberAction", () => {
  it("converts the discount limit to integer minor units", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    rpc.mockResolvedValue({ ok: true, data: null });
    await updateMemberAction(HALLS.h1, "m1", {
      role: "employee",
      discountLimit: "10.50",
      grants: [],
    });
    expect(rpc).toHaveBeenCalledWith(
      "update_member",
      expect.objectContaining({ p_discount_limit_minor: 1050 }),
    );
  });
  it("sends null for an empty limit and rejects malformed ones", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    rpc.mockResolvedValue({ ok: true, data: null });
    await updateMemberAction(HALLS.h1, "m1", { role: "employee", discountLimit: "", grants: [] });
    expect(rpc).toHaveBeenCalledWith(
      "update_member",
      expect.objectContaining({ p_discount_limit_minor: null }),
    );
    rpc.mockClear();
    const bad = await updateMemberAction(HALLS.h1, "m1", {
      role: "employee",
      discountLimit: "abc",
      grants: [],
    });
    expect(bad).toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not accept platform permissions as grants", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    const r = await updateMemberAction(HALLS.h1, "m1", {
      role: "employee",
      discountLimit: "",
      grants: ["platform.tenants.manage"],
    });
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("setMemberStatusAction", () => {
  it("requires a reason", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    expect(await setMemberStatusAction(HALLS.h1, "m1", "inactive", "  ")).toMatchObject({
      code: "VALIDATION",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("passes backend refusals through as friendly errors", async () => {
    getCtx.mockResolvedValue(PERSONAS.ownerH1H2);
    rpc.mockResolvedValue({
      ok: false,
      code: "PRECONDITION_FAILED",
      message: "A hall must keep at least one active owner.",
    });
    const r = await setMemberStatusAction(HALLS.h1, "m1", "inactive", "left");
    expect(r).toMatchObject({
      ok: false,
      message: expect.stringContaining("at least one active owner"),
    });
  });
});

describe("acceptInvitationAction", () => {
  it("requires a signed-in user", async () => {
    getCtx.mockResolvedValue(null);
    expect(await acceptInvitationAction("t")).toMatchObject({ code: "UNAUTHENTICATED" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("hides why an invitation failed", async () => {
    getCtx.mockResolvedValue(PERSONAS.customerOnly);
    rpc.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "x" });
    const r = await acceptInvitationAction("t");
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("invalid, expired") });
  });
  it("returns the hall id on success", async () => {
    getCtx.mockResolvedValue(PERSONAS.customerOnly);
    rpc.mockResolvedValue({ ok: true, data: HALLS.h1 });
    expect(await acceptInvitationAction("t")).toEqual({ ok: true, data: { hallId: HALLS.h1 } });
  });
});
