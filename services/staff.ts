import type { ServiceResult } from "@/types/reservation";
import { verifyHallManagementAccess } from "./access";

/** @deprecated Use verifyHallManagementAccess — kept for clearer call sites migrating from old name. */
export async function verifyStaffHallAccess(
  userId: string,
  hallId: string
): Promise<ServiceResult<true>> {
  return verifyHallManagementAccess(userId, hallId);
}
