"use server";

import { revalidatePath } from "next/cache";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import { isUuid } from "@/lib/auth/authorize";
import { createReservationSchema, reasonSchema, type CreateReservationInput } from "./schemas";

const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

function refresh(hallId: string) {
  revalidatePath(`/halls/${hallId}/reservations`);
  revalidatePath(`/halls/${hallId}/sessions`);
  revalidatePath(`/halls/${hallId}/devices`);
}

export async function createReservationAction(
  hallId: string,
  input: CreateReservationInput,
  idempotencyKey: string,
): Promise<ActionResult<{ id: string }>> {
  return withPermission(hallId, "reservation.create", async () => {
    const parsed = createReservationSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return invalid(String(issue?.path[0] ?? "deviceId"), issue?.message ?? "Invalid input");
    }
    if (!isUuid(idempotencyKey)) return invalid("deviceId", "Invalid request");
    const d = parsed.data;
    // Availability, overlap, maintenance and working hours are decided by the database.
    const r = await callRpc<string>("create_reservation", {
      p_hall_id: hallId,
      p_device_id: d.deviceId,
      p_customer_id: null,
      p_guest_name: d.guestName,
      p_start: new Date(d.startAt).toISOString(),
      p_end: new Date(d.endAt).toISOString(),
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    refresh(hallId);
    return { ok: true, data: { id: r.data } };
  });
}

/** Staff accept a player's pending request; the database re-checks that the slot is still free. */
export async function confirmReservationAction(
  hallId: string,
  reservationId: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "reservation.confirm", async () => {
    if (!isUuid(reservationId)) return invalid("reason", "Invalid request");
    const r = await callRpc<null>("confirm_reservation", { p_id: reservationId });
    if (r.ok) refresh(hallId);
    return r;
  });
}

export async function rejectReservationAction(
  hallId: string,
  reservationId: string,
  reason: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "reservation.confirm", async () => {
    const parsed = reasonSchema.safeParse(reason);
    if (!parsed.success)
      return invalid("reason", parsed.error.issues[0]?.message ?? "A reason is required");
    if (!isUuid(reservationId)) return invalid("reason", "Invalid request");
    const r = await callRpc<null>("reject_reservation", {
      p_id: reservationId,
      p_reason: parsed.data,
    });
    if (r.ok) refresh(hallId);
    return r;
  });
}

export async function cancelReservationAction(
  hallId: string,
  reservationId: string,
  reason: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "reservation.cancel", async () => {
    const parsed = reasonSchema.safeParse(reason);
    if (!parsed.success)
      return invalid("reason", parsed.error.issues[0]?.message ?? "A reason is required");
    if (!isUuid(reservationId)) return invalid("reason", "Invalid request");
    const r = await callRpc<null>("cancel_reservation", {
      p_id: reservationId,
      p_reason: parsed.data,
    });
    if (r.ok) refresh(hallId);
    return r;
  });
}

/**
 * Checks a customer in. The database creates the session in the same transaction, queues the Agent
 * command, and enforces the grace period; a late check-in needs the owner-level override permission.
 */
export async function checkInReservationAction(
  hallId: string,
  reservationId: string,
  overrideReason?: string,
): Promise<ActionResult<{ sessionId: string }>> {
  return withPermission(hallId, "reservation.check_in", async () => {
    if (!isUuid(reservationId)) return invalid("reason", "Invalid request");
    const reason = overrideReason?.trim();
    const r = await callRpc<string>("check_in_reservation", {
      p_id: reservationId,
      p_override_reason: reason ? reason : null,
    });
    if (!r.ok) return r;
    refresh(hallId);
    return { ok: true, data: { sessionId: r.data } };
  });
}
