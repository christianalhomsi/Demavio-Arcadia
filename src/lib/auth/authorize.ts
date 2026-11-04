import type { Permission } from "@/contracts/permissions";
import type { HallMembership, MyContext, PlatformRole } from "./context";

/**
 * Pure authorization decisions over a context loaded from the backend. No I/O, so every rule is
 * unit-testable. These mirror (and never replace) the checks inside RLS and RPCs: the database is
 * the authority (spec §21.1); this layer gives fast, consistent UX and fails closed.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export type HallAccess =
  | { status: "ok"; membership: HallMembership }
  /** No active membership of an active hall. Reported as 404 so halls cannot be enumerated. */
  | { status: "not_found" }
  /** A member who lacks the permission. Reported as 403. */
  | { status: "forbidden"; membership: HallMembership };

export function authorizeHall(ctx: MyContext, hallId: string, permission?: Permission): HallAccess {
  if (ctx.profile.status !== "active" || !isUuid(hallId)) return { status: "not_found" };

  const membership = ctx.memberships.find(
    (m) => m.hall_id === hallId && m.hall_status === "active",
  );
  if (!membership) return { status: "not_found" };

  if (permission && !membership.permissions.includes(permission)) {
    return { status: "forbidden", membership };
  }
  return { status: "ok", membership };
}

export type PlatformAccess = { status: "ok" } | { status: "not_found" };

/** Platform areas return 404 to everyone without the role. */
export function authorizePlatform(
  ctx: MyContext,
  role: PlatformRole | PlatformRole[],
): PlatformAccess {
  if (ctx.profile.status !== "active") return { status: "not_found" };
  const roles = Array.isArray(role) ? role : [role];
  return ctx.platform_roles.some((r) => roles.includes(r))
    ? { status: "ok" }
    : { status: "not_found" };
}
