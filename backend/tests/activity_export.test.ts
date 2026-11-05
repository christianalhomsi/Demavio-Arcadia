import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("truncate public.audit_logs");
});

async function q<T = any>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
    await db.exec("set local role authenticated");
    const r = await db.query<T>(sql, params);
    await db.exec("commit");
    return r.rows;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
const err = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return { message: e.message as string, detail: (e.detail ?? "") as string };
  }
  return { message: "NO_ERROR", detail: "" };
};

describe("list_my_activity (self-filtered)", () => {
  it("shows only the caller's own entries in that hall", async () => {
    await q(IDS.employeeH1, "select public.open_shift($1, null, 0, gen_random_uuid())", [IDS.h1]);
    await q(IDS.ownerH1H2, "select public.update_hall_policies($1,30,10,15,true,false,array['cash'])", [IDS.h1]);
    const mine = await q(IDS.employeeH1, "select * from public.list_my_activity($1)", [IDS.h1]);
    expect(mine.map((r) => r.action)).toEqual(["shift.open"]);
    const owners = await q(IDS.ownerH1H2, "select * from public.list_my_activity($1)", [IDS.h1]);
    expect(owners.map((r) => r.action)).toEqual(["hall.policies.update"]);
    expect(Number(mine[0]!.total)).toBe(1);
  });
  it("does not leak before/after data and refuses non-members", async () => {
    const [row] = await q(IDS.ownerH1H2, "select * from public.list_my_activity($1)", [IDS.h1]);
    expect(row === undefined || !("before_data" in row)).toBe(true);
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.superAdmin, IDS.customerOnly, IDS.deactivated, IDS.formerEmployeeH1]) {
      expect((await err(q(u, "select * from public.list_my_activity($1)", [IDS.h1]))).message, u).toBe("PERMISSION_DENIED");
    }
  });
  it("an owner of two halls only sees the requested hall", async () => {
    await q(IDS.ownerH1H2, "select public.update_hall_policies($1,30,10,15,true,false,array['cash'])", [IDS.h2]);
    expect(await q(IDS.ownerH1H2, "select * from public.list_my_activity($1)", [IDS.h1])).toEqual([]);
  });
});

describe("record_report_export", () => {
  const exp = (u: string, report = "financial_summary", from = "now() - interval '1 day'", to = "now()") =>
    q(u, `select public.record_report_export($1,$2, ${from}, ${to})`, [IDS.h1, report]);
  it("audits the export for report viewers only", async () => {
    await exp(IDS.ownerH1H2);
    const a = (await db.query<any>("select * from public.audit_logs where action = 'report.export'")).rows;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ actor_id: IDS.ownerH1H2, hall_id: IDS.h1, target_id: "financial_summary" });
    expect(a[0].after_data).toMatchObject({ format: "csv" });
    for (const u of [IDS.employeeH1, IDS.ownerH3, IDS.salesAgent, IDS.superAdmin, IDS.customerOnly]) {
      expect((await err(exp(u))).message, u).toBe("PERMISSION_DENIED");
    }
  });
  it("validates report name and period", async () => {
    expect((await err(exp(IDS.ownerH1H2, "everything"))).detail).toBe("report");
    expect((await err(exp(IDS.ownerH1H2, "financial_summary", "now()", "now()"))).detail).toBe("period");
    expect((await err(exp(IDS.ownerH1H2, "financial_summary", "now() - interval '400 days'", "now()"))).detail).toBe("period");
  });
});
