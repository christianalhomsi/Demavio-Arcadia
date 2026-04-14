export type AppUserRole =
  | "super_admin"
  | "hall_manager"
  | "hall_staff"
  | "player";

export const PROFILE_SUPER_ADMIN: AppUserRole = "super_admin";
export const HALL_DASHBOARD_ROLES: readonly AppUserRole[] = ["hall_manager", "hall_staff"];

export function isHallDashboardRole(role: string): role is AppUserRole {
  return (HALL_DASHBOARD_ROLES as readonly string[]).includes(role);
}
