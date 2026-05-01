import { getAdminClient } from "@/lib/supabase/admin";

export async function processReservationStatuses(): Promise<{
  activated: number;
  completed: number;
}> {
  const supabase = getAdminClient();
  const now = new Date().toISOString();

  // NOTE: We don't auto-activate reservations anymore.
  // Staff must manually check-in via the devices page.
  // This ensures proper session tracking and prevents ghost sessions.
  
  // active + وقت النهاية فات → completed
  const { data: completed, error: completeErr } = await supabase
    .from("reservations")
    .update({ status: "completed" })
    .eq("status", "active")
    .lte("end_time", now)
    .select("id");

  if (completeErr) throw new Error(`complete failed: ${completeErr.message}`);

  return {
    activated: 0, // No longer auto-activating
    completed: (completed ?? []).length,
  };
}
