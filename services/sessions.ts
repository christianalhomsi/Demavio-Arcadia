import { getAdminClient } from "@/lib/supabase/admin";
import type { ServiceResult } from "@/types/reservation";

export type Session = {
  id: string;
  reservation_id: string;
  device_id: string;
  hall_id: string;
  user_id: string | null;
  started_at: string;
  ended_at: string | null;
};

export async function createSession(
  reservationId: string,
  deviceId: string,
  userId: string | null,
  hallId: string
): Promise<ServiceResult<Session>> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      reservation_id: reservationId,
      device_id: deviceId,
      user_id: userId,
      hall_id: hallId,
      started_at: new Date().toISOString(),
    })
    .select("id, reservation_id, device_id, hall_id, user_id, started_at, ended_at")
    .single();

  if (error) return { success: false, error: error.message };

  // Create invoice immediately when session starts
  const { error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      session_id: data.id,
      hall_id: data.hall_id,
      device_id: data.device_id,
      user_id: data.user_id,
      started_at: data.started_at,
      ended_at: null,
      duration_hours: 0,
      rate_per_hour: 0,
      session_price: 0,
      items: [],
      items_total: 0,
      total_price: 0,
      is_paid: false,
    });

  if (invoiceError) {
    console.error("[createSession] Failed to create invoice:", invoiceError.message);
  }

  return { success: true, data };
}

export async function getActiveSession(
  sessionId: string
): Promise<ServiceResult<Session>> {
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from("sessions")
    .select("id, reservation_id, device_id, hall_id, user_id, started_at, ended_at")
    .eq("id", sessionId)
    .is("ended_at", null)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function endSession(
  sessionId: string,
  endedAt: string
): Promise<ServiceResult<true>> {
  const supabase = getAdminClient();

  const { error } = await supabase
    .from("sessions")
    .update({ ended_at: endedAt })
    .eq("id", sessionId)
    .is("ended_at", null);

  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}
