"use server";

import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { isUuid } from "@/lib/auth/authorize";
import { getMyContext } from "@/lib/auth/session";
import { quotePrice, type Quote } from "./queries";

const MAX_MS = 4 * 3_600_000;
const MIN_MS = 5 * 60_000;

function parseRange(startAt: string, endAt: string, players: number | null | undefined) {
  const s = Date.parse(startAt);
  const e = Date.parse(endAt);
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  if (e - s < MIN_MS || e - s > MAX_MS) return null;
  if (players != null && players !== 2 && players !== 4) return null;
  return { s, e, players: players ?? null };
}

/**
 * A player requests a booking for themself. Anyone may browse, but booking needs a signed-in, active
 * account. The request is created `pending` and holds the slot until staff confirm it; availability,
 * working hours, overlap and per-player limits are decided by the database.
 */
export async function createPlayerReservationAction(
  deviceId: string,
  startAt: string,
  endAt: string,
  idempotencyKey: string,
  players: number | null,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await getMyContext();
  if (!ctx) return fail("UNAUTHENTICATED", "Please sign in to book.");
  if (ctx.profile.status !== "active") return fail("FORBIDDEN", "This account is deactivated.");

  const range = parseRange(startAt, endAt, players);
  if (!isUuid(deviceId) || !isUuid(idempotencyKey) || !range) {
    return fail("VALIDATION", "Choose a valid time.");
  }

  const r = await callRpc<string>("create_player_reservation", {
    p_device_id: deviceId,
    p_start: new Date(range.s).toISOString(),
    p_end: new Date(range.e).toISOString(),
    p_key: idempotencyKey,
    ...(range.players ? { p_players: range.players } : {}),
  });
  if (!r.ok) return r;
  return { ok: true, data: { id: r.data } };
}

/** Public, read-only: an estimate shown before booking (the database owns the numbers). */
export async function quotePriceAction(
  deviceId: string,
  startAt: string,
  endAt: string,
  players: number | null,
): Promise<ActionResult<Quote>> {
  const range = parseRange(startAt, endAt, players);
  if (!isUuid(deviceId) || !range) return fail("VALIDATION", "Choose a valid time.");
  const q = await quotePrice(deviceId, range.players, new Date(range.s), new Date(range.e));
  return q ? { ok: true, data: q } : fail("UNKNOWN", "Price unavailable.");
}

/** A player cancels their own booking; the database enforces ownership and the hall's deadline. */
export async function cancelMyReservationAction(
  reservationId: string,
): Promise<ActionResult<null>> {
  const ctx = await getMyContext();
  if (!ctx) return fail("UNAUTHENTICATED", "Please sign in again.");
  if (!isUuid(reservationId)) return fail("VALIDATION", "Invalid request.");
  const r = await callRpc<null>("cancel_my_reservation", { p_id: reservationId });
  return r.ok ? { ok: true, data: null } : r;
}
