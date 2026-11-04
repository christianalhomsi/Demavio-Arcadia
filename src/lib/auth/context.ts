import type { Permission } from "@/contracts/permissions";
import { safeNext } from "./redirect";

/**
 * Shape returned by the proposed backend RPC `get_my_context()`
 * (see docs/planning/WEB_API_AND_DATA_CONTRACTS.md §2). The backend does not exist yet;
 * this type is the contract the web codes against.
 */
export type PlatformRole = "super_admin" | "sales_agent" | "sales_admin";

export interface HallMembership {
  hall_id: string;
  hall_name: string;
  hall_status: "active" | "inactive";
  role: "employee" | "owner";
  permissions: Permission[];
  discount_limit_minor: number | null;
}

export interface MyContext {
  profile: {
    id: string;
    display_name: string | null;
    email: string | null;
    status: "active" | "inactive";
    avatar_url: string | null;
    /** null = chosen later (Google sign-ins, older accounts); undefined only in old fixtures. */
    username?: string | null;
  };
  platform_roles: PlatformRole[];
  memberships: HallMembership[];
}

/** Where to send a signed-in user. Pure function so it is easy to test (AUTH-004). */
export function resolveLanding(ctx: MyContext): string {
  if (ctx.profile.status !== "active") return "/no-access?reason=inactive";

  if (ctx.platform_roles.includes("super_admin")) return "/admin";

  const activeHalls = ctx.memberships.filter((m) => m.hall_status === "active");
  if (activeHalls.length === 1 && activeHalls[0]) return `/halls/${activeHalls[0].hall_id}`;
  if (activeHalls.length > 1) return "/select-hall";

  if (ctx.platform_roles.some((r) => r === "sales_agent" || r === "sales_admin")) return "/sales";

  // Google login proves identity only; no privileged role means no dashboard (spec §5.2).
  return "/no-access";
}

/** True when the user holds any platform role or hall membership; everyone else is a player. */
export function isStaff(ctx: MyContext): boolean {
  return ctx.platform_roles.length > 0 || ctx.memberships.length > 0;
}

/**
 * Where to send a user right after sign-in. Staff always land on their own dashboards (a booking
 * deep link is dropped for them); players go back to where they were, or the public home page.
 */
export function postLoginDestination(ctx: MyContext, next: string | null | undefined): string {
  const dest = destinationAfterUsername(ctx, next);
  // Everyone needs a username (DEC-P21): people without one choose it first, then continue.
  return needsUsername(ctx) ? `/choose-username?next=${encodeURIComponent(dest)}` : dest;
}

function destinationAfterUsername(ctx: MyContext, next: string | null | undefined): string {
  if (!isStaff(ctx)) return safeNext(next, "/");
  const landing = resolveLanding(ctx);
  const dest = safeNext(next, landing);
  return dest === "/" || dest === "/book" || dest.startsWith("/book/") ? landing : dest;
}

/** True for an active account that has not chosen a username yet. */
export function needsUsername(ctx: MyContext): boolean {
  return ctx.profile.status === "active" && ctx.profile.username === null;
}

/** Where to go once the username is chosen (same rules as after sign-in). */
export function destinationAfterChoosing(ctx: MyContext, next: string | null | undefined): string {
  return destinationAfterUsername(ctx, next);
}
