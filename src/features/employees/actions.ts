"use server";

import { revalidatePath } from "next/cache";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import { getMyContext } from "@/lib/auth/session";
import { parseMoneyInput } from "@/lib/money";
import {
  deactivateSchema,
  inviteSchema,
  memberUpdateSchema,
  type InviteInput,
  type MemberUpdateInput,
} from "./schemas";

const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

/** Returns the one-time invitation token. The UI shows it once as a link; it is never stored in clear. */
export async function inviteMemberAction(
  hallId: string,
  input: InviteInput,
): Promise<ActionResult<{ token: string }>> {
  return withPermission(hallId, "employee.manage", async () => {
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success)
      return invalid("email", parsed.error.issues[0]?.message ?? "Invalid input");
    const r = await callRpc<string>("invite_member", {
      p_hall_id: hallId,
      p_email: parsed.data.email,
      p_role: parsed.data.role,
    });
    if (!r.ok) return r;
    revalidatePath(`/halls/${hallId}/employees`);
    return { ok: true, data: { token: r.data } };
  });
}

export async function revokeInvitationAction(
  hallId: string,
  invitationId: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "employee.manage", async () => {
    const r = await callRpc<null>("revoke_invitation", { p_invitation_id: invitationId });
    if (r.ok) revalidatePath(`/halls/${hallId}/employees`);
    return r;
  });
}

export async function updateMemberAction(
  hallId: string,
  membershipId: string,
  input: MemberUpdateInput,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "employee.manage", async () => {
    const parsed = memberUpdateSchema.safeParse(input);
    if (!parsed.success) {
      return invalid("discountLimit", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    // The input is decimal text; convert to integer minor units (no fractional math anywhere else).
    const limit =
      parsed.data.discountLimit === "" ? null : parseMoneyInput(parsed.data.discountLimit);
    const r = await callRpc<null>("update_member", {
      p_membership_id: membershipId,
      p_role: parsed.data.role,
      p_discount_limit_minor: limit,
      p_grants: parsed.data.grants,
    });
    if (r.ok) revalidatePath(`/halls/${hallId}/employees`);
    return r;
  });
}

export async function setMemberStatusAction(
  hallId: string,
  membershipId: string,
  status: "active" | "inactive",
  reason: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "employee.manage", async () => {
    const parsed = deactivateSchema.safeParse({ reason });
    if (!parsed.success)
      return invalid("reason", parsed.error.issues[0]?.message ?? "A reason is required");
    const r = await callRpc<null>("set_member_status", {
      p_membership_id: membershipId,
      p_status: status,
      p_reason: parsed.data.reason,
    });
    if (r.ok) revalidatePath(`/halls/${hallId}/employees`);
    return r;
  });
}

/** Accepting is a POST action (not a GET link) so a crafted link cannot join someone to a hall. */
export async function acceptInvitationAction(
  token: string,
): Promise<ActionResult<{ hallId: string }>> {
  if (!(await getMyContext()))
    return fail("UNAUTHENTICATED", "Please sign in to accept the invitation.");
  const r = await callRpc<string>("accept_invitation", { p_token: token });
  if (!r.ok) {
    return r.code === "NOT_FOUND"
      ? fail(
          "NOT_FOUND",
          "This invitation is invalid, expired, or was sent to a different Google account.",
        )
      : r;
  }
  return { ok: true, data: { hallId: r.data } };
}
