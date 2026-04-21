import { getServerClient } from "@/lib/supabase/server";
import type { ServiceResult } from "@/types/reservation";

export type Session = {
  id: string;
  reservation_id: string;
  device_id: string;
  user_id: string | null;
  started_at: string;
  ended_at: string | null;
};

export async function createSession(
  reservationId: string,
  deviceId: string,
  userId: string | null
): Promise<ServiceResult<Session>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      reservation_id: reservationId,
      device_id: deviceId,
      user_id: userId,
      started_at: new Date().toISOString(),
    })
    .select("id, reservation_id, device_id, user_id, started_at, ended_at")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getActiveSession(
  sessionId: string
): Promise<ServiceResult<Session>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("sessions")
    .select("id, reservation_id, device_id, user_id, started_at, ended_at")
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
  const supabase = await getServerClient();

  const { error } = await supabase
    .from("sessions")
    .update({ ended_at: endedAt })
    .eq("id", sessionId)
    .is("ended_at", null);

  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}
