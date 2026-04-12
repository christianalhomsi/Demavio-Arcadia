import { getServerClient } from "@/lib/supabase/server";
import type { ServiceResult } from "@/types/reservation";

export async function verifyStaffHallAccess(
  userId: string,
  hallId: string
): Promise<ServiceResult<true>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("staff_hall_access")
    .select("id")
    .eq("user_id", userId)
    .eq("hall_id", hallId)
    .single();

  if (error || !data) {
    return { success: false, error: "Staff does not have access to this hall" };
  }

  return { success: true, data: true };
}
