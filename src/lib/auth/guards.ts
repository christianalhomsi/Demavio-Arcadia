import "server-only";
import { forbidden, notFound } from "next/navigation";
import type { Permission } from "@/contracts/permissions";
import { authorizeHall, authorizePlatform } from "./authorize";
import type { HallMembership, MyContext, PlatformRole } from "./context";
import { requireUser } from "./session";

/** Page/layout guard: no active membership of this hall -> 404. */
export async function requireHallMembership(
  hallId: string,
): Promise<{ ctx: MyContext; membership: HallMembership }> {
  const ctx = await requireUser();
  const access = authorizeHall(ctx, hallId);
  if (access.status !== "ok") notFound();
  return { ctx, membership: access.membership };
}

/** Page guard: member of the hall without the permission -> 403, non-member -> 404. */
export async function requireHallPermission(
  hallId: string,
  permission: Permission,
): Promise<{ ctx: MyContext; membership: HallMembership }> {
  const ctx = await requireUser();
  const access = authorizeHall(ctx, hallId, permission);
  if (access.status === "not_found") notFound();
  if (access.status === "forbidden") forbidden();
  return { ctx, membership: access.membership as HallMembership };
}

/** Platform areas (/admin, /sales): anyone without the role gets 404. */
export async function requirePlatformRole(role: PlatformRole | PlatformRole[]): Promise<MyContext> {
  const ctx = await requireUser();
  if (authorizePlatform(ctx, role).status !== "ok") notFound();
  return ctx;
}
