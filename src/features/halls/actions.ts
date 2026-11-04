"use server";

import { revalidatePath } from "next/cache";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import {
  hallProfileSchema,
  policiesSchema,
  workingHoursSchema,
  type HallProfileInput,
  type PoliciesInput,
  type WorkingHoursInput,
} from "./schemas";

function invalid(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const i of error.issues) fieldErrors[String(i.path[0] ?? "root")] ??= i.message;
  return fail("VALIDATION", "Please check the highlighted fields.", fieldErrors);
}

export async function updateHallProfileAction(
  hallId: string,
  input: HallProfileInput,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "hall.settings.manage", async () => {
    const parsed = hallProfileSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const r = await callRpc<null>("update_hall_profile", {
      p_hall_id: hallId,
      p_name: parsed.data.name,
      p_address: parsed.data.address,
      p_contact_phone: parsed.data.contactPhone,
      p_time_zone: parsed.data.timeZone,
    });
    if (r.ok) revalidatePath(`/halls/${hallId}`, "layout");
    return r;
  });
}

export async function updatePoliciesAction(
  hallId: string,
  input: PoliciesInput,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "hall.settings.manage", async () => {
    const parsed = policiesSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const p = parsed.data;
    const r = await callRpc<null>("update_hall_policies", {
      p_hall_id: hallId,
      p_checkin_grace_minutes: p.checkinGraceMinutes,
      p_cancellation_deadline_minutes: p.cancellationDeadlineMinutes,
      p_reminder_minutes: p.reminderMinutes,
      p_waiting_list_enabled: p.waitingListEnabled,
      p_allow_partial_payments: p.allowPartialPayments,
      p_payment_methods: p.paymentMethods,
    });
    if (r.ok) revalidatePath(`/halls/${hallId}/settings`);
    return r;
  });
}

export async function setWorkingHoursAction(
  hallId: string,
  input: WorkingHoursInput,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "hall.settings.manage", async () => {
    const parsed = workingHoursSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const r = await callRpc<null>("set_working_hours", { p_hall_id: hallId, p_hours: parsed.data });
    if (r.ok) revalidatePath(`/halls/${hallId}/settings`);
    return r;
  });
}
