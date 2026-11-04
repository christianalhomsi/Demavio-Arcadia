"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPlatformRole } from "@/lib/actions/withPlatformRole";
import { HALL_CURRENCIES } from "@/features/admin/schemas";
import { isUuid } from "@/lib/auth/authorize";

const SALES = ["sales_agent", "sales_admin"] as const;
const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

function refresh() {
  revalidatePath("/sales", "layout");
  revalidatePath("/admin", "layout");
}

const reasonSchema = z.string().trim().min(3, "Enter a reason (at least 3 characters)").max(300);

const hallRequestSchema = z.object({
  hallName: z.string().trim().min(1, "Enter the hall name").max(120),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((c) => HALL_CURRENCIES.some((h) => h === c), "Choose SYP or USD"),
  ownerEmail: z.email("Enter the owner's email").max(254),
  ownerUsername: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "3-20 characters: letters, digits or underscore"),
  ownerPassword: z.string().min(8, "At least 8 characters").max(72, "At most 72 characters"),
  /** The subscription the customer wants; empty means the unlimited plan. */
  planId: z.string().trim().optional(),
});
export type HallRequestInput = z.input<typeof hallRequestSchema>;

/**
 * Sends a request to create a hall and its owner account. One approval (the agent's manager or a
 * super admin) activates it. The password is hashed in the database.
 */
export async function submitHallRequestAction(
  input: HallRequestInput,
): Promise<ActionResult<null>> {
  return withPlatformRole([...SALES], async () => {
    const p = hallRequestSchema.safeParse(input);
    if (!p.success) {
      const issue = p.error.issues[0]!;
      return invalid(String(issue.path[0] ?? "hallName"), issue.message);
    }
    const planId = p.data.planId ?? "";
    if (planId && !isUuid(planId)) return invalid("planId", "Choose a subscription");
    const r = await callRpc<string>("submit_hall_request", {
      p_hall_name: p.data.hallName,
      p_currency: p.data.currency,
      p_owner_email: p.data.ownerEmail,
      p_owner_username: p.data.ownerUsername,
      p_owner_password: p.data.ownerPassword,
      p_plan_id: planId || null,
    });
    if (!r.ok) {
      if (r.code === "NOT_FOUND")
        return invalid("planId", "This subscription is no longer available");
      if (r.code === "CONFLICT") {
        const field = r.message.toLowerCase().includes("username") ? "ownerUsername" : "ownerEmail";
        return invalid(field, r.message);
      }
      return r;
    }
    refresh();
    return { ok: true, data: null };
  });
}

/** The RPC decides who may approve (the agent's manager or a super admin) and creates the hall. */
export async function approveHallRequestAction(
  requestId: string,
  idempotencyKey: string,
): Promise<ActionResult<null>> {
  return withPlatformRole([...SALES, "super_admin"], async () => {
    if (!isUuid(requestId) || !isUuid(idempotencyKey)) return invalid("request", "Invalid request");
    const r = await callRpc<unknown>("approve_hall_request", {
      p_request_id: requestId,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    refresh();
    return { ok: true, data: null };
  });
}

export async function rejectHallRequestAction(
  requestId: string,
  reason: string,
): Promise<ActionResult<null>> {
  return withPlatformRole([...SALES, "super_admin"], async () => {
    if (!isUuid(requestId)) return invalid("reason", "Invalid request");
    const p = reasonSchema.safeParse(reason);
    if (!p.success) return invalid("reason", p.error.issues[0]!.message);
    const r = await callRpc<null>("reject_hall_request", {
      p_request_id: requestId,
      p_reason: p.data,
    });
    if (r.ok) refresh();
    return r;
  });
}
