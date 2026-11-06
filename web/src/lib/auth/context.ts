import type { Permission } from "@/contracts/permissions";
import { HALL_NAV } from "@/components/shell/nav";
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
  if (activeHalls.length === 1 && activeHalls[0]) return hallLanding(activeHalls[0]);
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
  if (!isStaff(ctx)) {
    // Players only have the public pages; anything else would be a 404.
    const dest = safeNext(next, "/");
    const ok =
      dest === "/" || dest === "/reservations" || dest.startsWith("/book") || isInvitePath(dest);
    return ok ? dest : "/";
  }
  const landing = resolveLanding(ctx);
  const dest = safeNext(next, landing);
  // An invitation link must survive sign-in: a new employee has no hall yet to land on instead.
  if (isInvitePath(dest)) return dest;
  if (dest === "/" || dest === "/book" || dest.startsWith("/book/")) return landing;
  // A target this account cannot open (another role's page, a hall it is not in) falls back to home.
  return canOpenPath(ctx, dest) ? dest : landing;
}

/** `/invite/<token>`: the page itself checks the token against the signed-in account. */
function isInvitePath(path: string): boolean {
  return /^\/invite\/[^/?#]+$/.test(path);
}

/** True for an active account that has not chosen a username yet. */
export function needsUsername(ctx: MyContext): boolean {
  return ctx.profile.status === "active" && ctx.profile.username === null;
}

/** Where to go once the username is chosen (same rules as after sign-in). */
export function destinationAfterChoosing(ctx: MyContext, next: string | null | undefined): string {
  return destinationAfterUsername(ctx, next);
}

/** Hall route segment -> nav path that carries its permission (see components/shell/nav.ts). */
const HALL_SEGMENT_NAV: Record<string, string> = {
  devices: "/devices",
  reservations: "/reservations",
  sessions: "/sessions",
  products: "/products",
  agents: "/agents",
  commands: "/commands",
  invoices: "/invoices",
  payments: "/invoices",
  wallets: "/wallets",
  refunds: "/refunds",
  adjustments: "/adjustments",
  expenses: "/expenses",
  shifts: "/shifts",
  registers: "/registers",
  reports: "/reports",
  "my-activity": "/my-activity",
  pricing: "/pricing",
  packages: "/packages",
  discounts: "/discounts",
  employees: "/employees",
  settings: "/settings",
  audit: "/audit",
};

/** First hall page this membership may open (the overview needs device.view, not everyone has it). */
export function hallLanding(m: HallMembership): string {
  const base = `/halls/${m.hall_id}`;
  for (const group of HALL_NAV) {
    for (const item of group.items) {
      if (!item.permission || m.permissions.includes(item.permission)) return base + item.path;
    }
  }
  return base;
}

/**
 * True when this user would actually be allowed to open `path`. Used to drop a stale `?next=` (from
 * another account, an expired session, a bookmark) instead of sending someone to a 404/403 page.
 */
export function canOpenPath(ctx: MyContext, rawPath: string): boolean {
  const path = rawPath.split(/[?#]/)[0] ?? "";
  const seg = path.split("/").filter(Boolean);
  const roles = ctx.platform_roles;
  if (seg.length === 0) return true;

  switch (seg[0]) {
    case "admin":
      return roles.includes("super_admin");
    case "sales": {
      if (seg[1] === "attribution" || seg[1] === "agents") return roles.includes("sales_admin");
      if (seg[1] === "manager") return roles.includes("sales_agent");
      return roles.includes("sales_agent") || roles.includes("sales_admin");
    }
    case "select-hall":
      return ctx.memberships.length > 0;
    case "halls": {
      const m = ctx.memberships.find((x) => x.hall_id === seg[1] && x.hall_status === "active");
      if (!m) return false;
      if (seg.length === 2) return m.permissions.includes("device.view");
      if (seg[2] === "devices" && (seg[3] === "new" || seg[4] === "edit"))
        return m.permissions.includes("hall.settings.manage");
      const navPath = HALL_SEGMENT_NAV[seg[2] ?? ""];
      if (navPath === undefined) return false;
      const item = HALL_NAV.flatMap((g) => g.items).find((i) => i.path === navPath);
      return !item?.permission || m.permissions.includes(item.permission);
    }
    default:
      return false;
  }
}
