"use server";

import { revalidatePath } from "next/cache";
import { callRpc } from "@/lib/actions/rpc";
import { resolvePlayer } from "./player";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import { isUuid } from "@/lib/auth/authorize";
import {
  END_TYPES,
  extendSchema,
  walkInSchema,
  type EndType,
  type ExtendInput,
  type WalkInInput,
} from "./schemas";

const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

function refresh(hallId: string) {
  revalidatePath(`/halls/${hallId}/sessions`);
  revalidatePath(`/halls/${hallId}/devices`);
  revalidatePath(`/halls/${hallId}/reservations`);
}

export async function startWalkInAction(
  hallId: string,
  input: WalkInInput,
  idempotencyKey: string,
): Promise<ActionResult<{ sessionId: string }>> {
  return withPermission(hallId, "session.start", async () => {
    const parsed = walkInSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return invalid(String(issue?.path[0] ?? "deviceId"), issue?.message ?? "Invalid input");
    }
    if (!isUuid(idempotencyKey)) return invalid("deviceId", "Invalid request");
    const d = parsed.data;
    const player = await resolvePlayer(hallId, d.username);
    if (!player.ok) return player;
    const r = await callRpc<string>("start_walk_in", {
      p_hall_id: hallId,
      p_device_id: d.deviceId,
      p_type: d.type,
      p_duration_minutes: d.type === "fixed" ? d.durationMinutes : null,
      p_customer_id: player.data,
      p_guest_name: player.data ? null : d.guestName,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    refresh(hallId);
    return { ok: true, data: { sessionId: r.data } };
  });
}

/**
 * Ends a session. This records the actual duration only: it never creates a payment or marks an
 * invoice paid (invoice finalization arrives with the finance module).
 */
export async function endSessionAction(
  hallId: string,
  sessionId: string,
  endType: EndType,
  reason: string,
): Promise<ActionResult<{ billableSeconds: number }>> {
  return withPermission(hallId, "session.end", async () => {
    if (!END_TYPES.includes(endType)) return invalid("endType", "Choose how the session ended");
    if (!isUuid(sessionId)) return invalid("endType", "Invalid request");
    if (endType !== "normal" && reason.trim().length === 0)
      return invalid("reason", "A reason is required");
    const r = await callRpc<number>("end_session", {
      p_id: sessionId,
      p_end_type: endType,
      p_reason: reason.trim() || null,
    });
    if (!r.ok) return r;
    refresh(hallId);
    return { ok: true, data: { billableSeconds: Number(r.data) } };
  });
}

export async function extendSessionAction(
  hallId: string,
  sessionId: string,
  input: ExtendInput,
  idempotencyKey: string,
): Promise<ActionResult<{ newEnd: string }>> {
  return withPermission(hallId, "session.extend", async () => {
    const parsed = extendSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return invalid(String(issue?.path[0] ?? "minutes"), issue?.message ?? "Invalid input");
    }
    if (!isUuid(sessionId) || !isUuid(idempotencyKey)) return invalid("minutes", "Invalid request");
    const r = await callRpc<string>("extend_session", {
      p_id: sessionId,
      p_minutes: parsed.data.minutes,
      p_reason: parsed.data.reason,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    refresh(hallId);
    return { ok: true, data: { newEnd: r.data } };
  });
}

export async function convertToOpenAction(
  hallId: string,
  sessionId: string,
  reason: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "session.extend", async () => {
    if (!isUuid(sessionId)) return invalid("reason", "Invalid request");
    if (reason.trim().length === 0) return invalid("reason", "A reason is required");
    const r = await callRpc<null>("convert_session_to_open", {
      p_id: sessionId,
      p_reason: reason.trim(),
    });
    if (r.ok) refresh(hallId);
    return r;
  });
}
