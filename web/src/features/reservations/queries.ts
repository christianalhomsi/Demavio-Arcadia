import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ReservationStatus } from "./schemas";

export interface ReservationRow {
  id: string;
  deviceId: string;
  deviceName: string;
  customerName: string | null;
  status: ReservationStatus;
  startAt: string;
  endAt: string;
  sessionId: string | null;
  cancelReason: string | null;
  playersCount: number | null;
}

export async function listReservations(
  hallId: string,
  from: Date,
  to: Date,
  status?: ReservationStatus,
): Promise<ReservationRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_reservations", {
    p_hall_id: hallId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_status: status ?? null,
  });
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    deviceId: r.device_id as string,
    deviceName: r.device_name as string,
    customerName: (r.customer_name as string | null) ?? null,
    status: r.status as ReservationStatus,
    startAt: r.start_at as string,
    endAt: r.end_at as string,
    sessionId: (r.session_id as string | null) ?? null,
    cancelReason: (r.cancel_reason as string | null) ?? null,
    playersCount: (r.players_count as number | null) ?? null,
  }));
}

export interface ReservationEvent {
  id: string;
  type: string;
  at: string;
  detail: Record<string, unknown> | null;
}

export async function getReservation(hallId: string, id: string) {
  const supabase = await createClient();
  const [res, events] = await Promise.all([
    supabase
      .from("reservations")
      .select("id,hall_id,device_id,status,start_at,end_at,late_override_reason,cancel_reason")
      .eq("id", id)
      .eq("hall_id", hallId)
      .maybeSingle(),
    supabase
      .from("reservation_events")
      .select("id,event_type,created_at,detail")
      .eq("reservation_id", id)
      .order("created_at"),
  ]);
  if (res.error || !res.data) return null;
  // Display names come from the RPC; query exactly this reservation's window and pick it out.
  const named = (
    await listReservations(hallId, new Date(res.data.start_at), new Date(res.data.end_at))
  )?.find((r) => r.id === id);
  return {
    id: res.data.id as string,
    deviceId: res.data.device_id as string,
    deviceName: named?.deviceName ?? "Device",
    customerName: named?.customerName ?? null,
    status: res.data.status as ReservationStatus,
    startAt: res.data.start_at as string,
    endAt: res.data.end_at as string,
    lateOverrideReason: res.data.late_override_reason as string | null,
    cancelReason: res.data.cancel_reason as string | null,
    sessionId: named?.sessionId ?? null,
    events: (events.data ?? []).map((e): ReservationEvent => ({
      id: e.id,
      type: e.event_type,
      at: e.created_at,
      detail: e.detail,
    })),
  };
}
