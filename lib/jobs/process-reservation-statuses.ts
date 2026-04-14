import { getAdminClient } from "@/lib/supabase/admin";

export async function processReservationStatuses(): Promise<{
  activated: number;
  completed: number;
}> {
  const supabase = getAdminClient();
  const now = new Date().toISOString();

  // confirmed + وقت البداية وصل → active
  const { data: activated, error: activateErr } = await supabase
    .from("reservations")
    .update({ status: "active" })
    .eq("status", "confirmed")
    .lte("start_time", now)
    .gt("end_time", now)
    .select("id");

  if (activateErr) throw new Error(`activate failed: ${activateErr.message}`);

  // active + وقت النهاية فات → completed
  const { data: completed, error: completeErr } = await supabase
    .from("reservations")
    .update({ status: "completed" })
    .eq("status", "active")
    .lte("end_time", now)
    .select("id");

  if (completeErr) throw new Error(`complete failed: ${completeErr.message}`);

  return {
    activated: (activated ?? []).length,
    completed: (completed ?? []).length,
  };
}
