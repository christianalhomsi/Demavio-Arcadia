import { PERMISSIONS, type Permission } from "@/contracts/permissions";
import type { HallMembership, MyContext, PlatformRole } from "@/lib/auth/context";

/**
 * Test personas mirroring backend/supabase/seed.sql and the PROVISIONAL role matrix
 * (backend/supabase/migrations/*_seed_roles_and_permissions.sql, pending DEC-01).
 * If the backend matrix changes, update EMPLOYEE_PERMISSIONS here. Integration tests against a
 * real Supabase (later) replace these fixtures with contexts from get_my_context().
 */

export const HALLS = {
  h1: "22222222-0000-0000-0000-000000000001",
  h2: "22222222-0000-0000-0000-000000000002",
  h3: "22222222-0000-0000-0000-000000000003",
} as const;

export const EMPLOYEE_PERMISSIONS: Permission[] = [
  "reservation.view",
  "reservation.create",
  "reservation.cancel",
  "reservation.confirm",
  "reservation.check_in",
  "product.sell",
  "discount.apply",
  "session.start",
  "session.end",
  "session.extend",
  "device.view",
  "device.control",
  "invoice.view",
  "payment.collect",
  "refund.request",
  "wallet.view",
  "wallet.top_up",
  "shift.open",
  "shift.close",
];

export const OWNER_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (p) => p !== "platform.tenants.manage",
);

function membership(
  hallId: string,
  role: "employee" | "owner",
  over: Partial<HallMembership> = {},
): HallMembership {
  return {
    hall_id: hallId,
    hall_name: `Hall ${hallId.slice(-1)}`,
    hall_status: "active",
    role,
    permissions: role === "owner" ? OWNER_PERMISSIONS : EMPLOYEE_PERMISSIONS,
    discount_limit_minor: null,
    ...over,
  };
}

function ctx(
  id: string,
  memberships: HallMembership[] = [],
  platform_roles: PlatformRole[] = [],
  status: "active" | "inactive" = "active",
): MyContext {
  return {
    profile: { id, display_name: id, email: `${id}@example.test`, status, avatar_url: null },
    platform_roles,
    memberships,
  };
}

export const PERSONAS = {
  ownerH1H2: ctx("ownerH1H2", [membership(HALLS.h1, "owner"), membership(HALLS.h2, "owner")]),
  employeeH1: ctx("employeeH1", [membership(HALLS.h1, "employee")]),
  ownerH3: ctx("ownerH3", [membership(HALLS.h3, "owner")]),
  superAdmin: ctx("superAdmin", [], ["super_admin"]),
  salesAgent: ctx("salesAgent", [], ["sales_agent"]),
  salesAdmin: ctx("salesAdmin", [], ["sales_admin"]),
  customerOnly: ctx("customerOnly"),
  deactivated: ctx("deactivated", [membership(HALLS.h1, "employee")], [], "inactive"),
  employeeInactiveHall: ctx("employeeInactiveHall", [
    membership(HALLS.h1, "employee", { hall_status: "inactive", permissions: [] }),
  ]),
} as const;

export type PersonaName = keyof typeof PERSONAS;
