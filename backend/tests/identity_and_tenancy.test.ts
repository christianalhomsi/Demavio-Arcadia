import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IDS, asUser, createDb } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

const ctx = async (user: string) =>
  asUser(db, user, async () => {
    const r = await db.query<{ c: any }>("select public.get_my_context() as c");
    return r.rows[0]!.c;
  });

const count = (user: string | null, table: string) =>
  asUser(db, user, async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`);
    return r.rows[0]!.n;
  });

const hasPerm = (user: string, hall: string, perm: string) =>
  asUser(db, user, async () => {
    const r = await db.query<{ ok: boolean }>("select public.has_hall_permission($1, $2) as ok", [hall, perm]);
    return r.rows[0]!.ok;
  });

describe("profile creation", () => {
  it("creates a profile for every auth user with no roles (authentication is not authorization)", async () => {
    const p = await db.query<{ n: number }>("select count(*)::int n from public.profiles");
    expect(p.rows[0]!.n).toBe(8);
    const c = await ctx(IDS.customerOnly);
    expect(c.memberships).toEqual([]);
    expect(c.platform_roles).toEqual([]);
    expect(c.profile.email).toBe("customer.only@example.test");
  });
});

describe("get_my_context", () => {
  it("is not executable by anonymous callers", async () => {
    await expect(
      asUser(db, null, () => db.query("select public.get_my_context()")),
    ).rejects.toThrow(/permission denied/i);
  });

  it("returns the owner's two halls with owner permissions", async () => {
    const c = await ctx(IDS.ownerH1H2);
    expect(c.memberships).toHaveLength(2);
    for (const m of c.memberships) {
      expect(m.role).toBe("owner");
      expect(m.hall_status).toBe("active");
      expect(m.permissions).toContain("employee.manage");
      expect(m.permissions).not.toContain("platform.tenants.manage");
    }
  });

  it("limits employees to operational permissions", async () => {
    const c = await ctx(IDS.employeeH1);
    expect(c.memberships).toHaveLength(1);
    const perms: string[] = c.memberships[0].permissions;
    expect(perms).toContain("payment.collect");
    for (const denied of ["employee.manage", "wallet.withdraw", "report.financial.view", "hall.settings.manage", "refund.approve"]) {
      expect(perms).not.toContain(denied);
    }
  });

  it("omits inactive memberships", async () => {
    expect((await ctx(IDS.formerEmployeeH1)).memberships).toEqual([]);
  });

  it("reports deactivated profiles as inactive with no roles even if rows exist", async () => {
    const c = await ctx(IDS.deactivated);
    expect(c.profile.status).toBe("inactive");
    expect(c.memberships).toEqual([]);
    expect(c.platform_roles).toEqual([]);
  });

  it("returns platform roles", async () => {
    expect((await ctx(IDS.superAdmin)).platform_roles).toEqual(["super_admin"]);
    expect((await ctx(IDS.salesAgent)).platform_roles).toEqual(["sales_agent"]);
  });

  it("marks a deactivated hall inactive and strips its permissions", async () => {
    await db.exec(`update public.halls set status = 'inactive' where id = '${IDS.h3}'`);
    try {
      const m = (await ctx(IDS.ownerH3)).memberships[0];
      expect(m.hall_status).toBe("inactive");
      expect(m.permissions).toEqual([]);
      expect(await hasPerm(IDS.ownerH3, IDS.h3, "employee.manage")).toBe(false);
    } finally {
      await db.exec(`update public.halls set status = 'active' where id = '${IDS.h3}'`);
    }
  });
});

describe("has_hall_permission", () => {
  it("allows what the role grants, in the member's own hall", async () => {
    expect(await hasPerm(IDS.employeeH1, IDS.h1, "payment.collect")).toBe(true);
    expect(await hasPerm(IDS.ownerH1H2, IDS.h2, "refund.approve")).toBe(true);
  });
  it("denies permissions the role lacks", async () => {
    expect(await hasPerm(IDS.employeeH1, IDS.h1, "employee.manage")).toBe(false);
  });
  it("denies other halls of the same tenant and other tenants", async () => {
    expect(await hasPerm(IDS.employeeH1, IDS.h2, "payment.collect")).toBe(false);
    expect(await hasPerm(IDS.employeeH1, IDS.h3, "payment.collect")).toBe(false);
  });
  it("gives super admin and sales no hall financial permissions", async () => {
    expect(await hasPerm(IDS.superAdmin, IDS.h1, "refund.approve")).toBe(false);
    expect(await hasPerm(IDS.salesAgent, IDS.h1, "invoice.view")).toBe(false);
  });
  it("denies deactivated users and inactive memberships", async () => {
    expect(await hasPerm(IDS.deactivated, IDS.h1, "payment.collect")).toBe(false);
    expect(await hasPerm(IDS.formerEmployeeH1, IDS.h1, "payment.collect")).toBe(false);
  });
  it("honors per-membership grants", async () => {
    const m = await db.query<{ id: string }>(
      "select id from public.hall_memberships where user_id = $1 and hall_id = $2",
      [IDS.employeeH1, IDS.h1],
    );
    await db.query("insert into public.hall_membership_grants values ($1, 'report.financial.view')", [m.rows[0]!.id]);
    try {
      expect(await hasPerm(IDS.employeeH1, IDS.h1, "report.financial.view")).toBe(true);
    } finally {
      await db.exec("delete from public.hall_membership_grants");
    }
  });
});

describe("row-level security / tenant isolation", () => {
  it("employees see only their hall, membership and profile", async () => {
    expect(await count(IDS.employeeH1, "halls")).toBe(1);
    expect(await count(IDS.employeeH1, "hall_memberships")).toBe(1);
    expect(await count(IDS.employeeH1, "profiles")).toBe(1);
  });
  it("another tenant's owner cannot see tenant one halls", async () => {
    const n = await asUser(db, IDS.ownerH3, async () => {
      const r = await db.query<{ n: number }>("select count(*)::int n from public.halls where id in ($1, $2)", [IDS.h1, IDS.h2]);
      return r.rows[0]!.n;
    });
    expect(n).toBe(0);
  });
  it("owners see all memberships in their halls (employee.manage) but not other tenants'", async () => {
    // H1: owner, employee, former employee, deactivated user; H2: owner (same user) => 5 rows
    expect(await count(IDS.ownerH1H2, "hall_memberships")).toBe(5);
    expect(await count(IDS.ownerH3, "hall_memberships")).toBe(1);
  });
  it("sales agents see no halls; super admin sees all", async () => {
    expect(await count(IDS.salesAgent, "halls")).toBe(0);
    expect(await count(IDS.superAdmin, "halls")).toBe(3);
  });
  it("anonymous users see nothing", async () => {
    await expect(count(null, "halls")).rejects.toThrow(/permission denied/i);
  });
});

describe("clients cannot write", () => {
  it("cannot create memberships or change profiles directly", async () => {
    await expect(
      asUser(db, IDS.ownerH1H2, () =>
        db.query("insert into public.hall_memberships (hall_id, user_id, role_key) values ($1, $2, 'owner')", [IDS.h1, IDS.customerOnly]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(db, IDS.deactivated, () => db.query("update public.profiles set status = 'active' where id = $1", [IDS.deactivated])),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("integrity", () => {
  it("rejects wrong-scope roles", async () => {
    await expect(
      db.query("insert into public.hall_memberships (hall_id, user_id, role_key) values ($1, $2, 'super_admin')", [IDS.h3, IDS.customerOnly]),
    ).rejects.toThrow(/hall-scope role/);
    await expect(
      db.query("insert into public.user_role_assignments (user_id, role_key) values ($1, 'owner')", [IDS.customerOnly]),
    ).rejects.toThrow(/platform-scope role/);
  });
  it("keeps audit_logs append-only", async () => {
    await db.exec("insert into public.audit_logs (action) values ('test')");
    await expect(db.exec("update public.audit_logs set action = 'x'")).rejects.toThrow(/append-only/);
    await expect(db.exec("delete from public.audit_logs")).rejects.toThrow(/append-only/);
  });
});
