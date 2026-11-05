import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

const SALES_ADMIN = "33333333-0000-0000-0000-0000000000b1";
let db: PGlite;
beforeAll(async () => {
  db = await createDb();
  await db.exec(`insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values ('${SALES_ADMIN}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sales.admin2@example.test', '{}', now(), now());
    insert into public.user_role_assignments (user_id, role_key) values ('${SALES_ADMIN}', 'sales_admin');`);
}, 60_000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("truncate public.audit_logs; truncate public.sales_attributions cascade;");
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

const SA = IDS.superAdmin;
const others = [IDS.ownerH1H2, IDS.employeeH1, IDS.ownerH3, IDS.salesAgent, IDS.customerOnly, IDS.deactivated, SALES_ADMIN];

describe("admin_monitoring", () => {
  it("shows operational health per hall and no financial figures", async () => {
    const rows = await q(SA, "select * from public.admin_monitoring()");
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const h1 = rows.find((r) => r.hall_id === IDS.h1)!;
    expect(h1).toMatchObject({ agents_total: 2, agents_recent: 1, hall_status: "active" });
    expect(Object.keys(h1).join()).not.toMatch(/cash|payment|invoice|revenue|difference/);
  });
  it("counts failed and pending commands", async () => {
    const dev = "44444444-0000-0000-0000-000000000001";
    await db.exec(`insert into public.agent_commands (hall_id, device_id, command_type, status) values
      ('${IDS.h1}','${dev}','LOCK','Failed'), ('${IDS.h1}','${dev}','LOCK','TimedOut'),
      ('${IDS.h1}','${dev}','LOCK','Queued'), ('${IDS.h1}','${dev}','LOCK','Executed')`);
    const h1 = (await q(SA, "select * from public.admin_monitoring()")).find((r) => r.hall_id === IDS.h1)!;
    expect(h1).toMatchObject({ commands_failed_24h: 2, commands_pending: 1 });
    await db.exec("truncate public.agent_commands cascade");
  });
  it("is super-admin only", async () => {
    for (const u of others) expect((await err(q(u, "select * from public.admin_monitoring()"))).message, u).toBe("PERMISSION_DENIED");
  });
});
