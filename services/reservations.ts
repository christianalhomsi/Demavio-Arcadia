import { getServerClient } from "@/lib/supabase/server";
import type { BookingInput } from "@/schemas/booking";
import type { Reservation, ServiceResult } from "@/types/reservation";

const EXCLUSION_VIOLATION = "23P01";

export async function getReservation(
  reservationId: string
): Promise<ServiceResult<Reservation>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("reservations")
    .select("id, device_id, user_id, guest_name, start_time, end_time, created_at, status")
    .eq("id", reservationId)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function setReservationActive(
  reservationId: string
): Promise<ServiceResult<true>> {
  const supabase = await getServerClient();

  const { error } = await supabase
    .from("reservations")
    .update({ status: "active" })
    .eq("id", reservationId)
    .eq("status", "confirmed");

  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}

export async function createReservation(
  input: BookingInput,
  userId: string | null = null
): Promise<ServiceResult<Reservation>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("reservations")
    .insert({
      device_id: input.device_id,
      user_id: userId,
      guest_name: input.guest_name || null,
      start_time: input.start_time.toISOString(),
      end_time: input.end_time.toISOString(),
    })
    .select("id, device_id, user_id, guest_name, start_time, end_time, created_at, status")
    .single();

  if (error) {
    if (error.code === EXCLUSION_VIOLATION || error.message?.toLowerCase().includes("overlap")) {
      return { success: false, error: "OVERLAP" };
    }
    return { success: false, error: error.message };
  }

  return { success: true, data };
}
