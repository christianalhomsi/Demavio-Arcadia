import { getServerClient } from "@/lib/supabase/server";
import type { ServiceResult } from "@/types/reservation";
import { PROFILE_SUPER_ADMIN } from "@/types/user-role";

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data?.role) return false;
  return data.role === PROFILE_SUPER_ADMIN;
}

export async function getHallIdForStaff(userId: string): Promise<string | null> {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("staff_assignments")
    .select("hall_id")
    .eq("user_id", userId)
    .in("role", ["hall_manager", "hall_staff"])
    .maybeSingle();
  if (error || !data) return null;
  return data.hall_id;
}

export async function getHallIdForManager(userId: string): Promise<string | null> {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("staff_assignments")
    .select("hall_id")
    .eq("user_id", userId)
    .eq("role", "hall_manager")
    .maybeSingle();
  if (error || !data) return null;
  return data.hall_id;
}

export async function verifyHallManagementAccess(
  userId: string,
  hallId: string
): Promise<ServiceResult<true>> {
  if (await isSuperAdmin(userId)) return { success: true, data: true };

  const supabase = await getServerClient();

  const { data } = await supabase
    .from("staff_assignments")
    .select("hall_id")
    .eq("user_id", userId)
    .eq("hall_id", hallId)
    .in("role", ["hall_manager", "hall_staff"])
    .maybeSingle();

  if (data) return { success: true, data: true };
  return { success: false, error: "No access to this hall" };
}
