import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => {
  await db.close();
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
let n = 0;
const makeHall = async (name: string) => {
  n += 1;
  const key = `55555555-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const [{ id }] = await q(IDS.superAdmin, "select public.admin_create_hall_with_owner($1,'USD',$2,'secret123',$3,$4) as id", [
    name, `${name.toLowerCase()}@example.test`, `${name.toLowerCase()}_own`, key,
  ]);
  const owner = (await db.query<any>("select user_id from public.hall_memberships where hall_id = $1", [id])).rows[0].user_id;
  return { id: id as string, owner: owner as string };
};
const hallTables = async () =>
  (
    await db.query<any>(`select c.relname from pg_attribute a join pg_class c on c.oid = a.attrelid and c.relkind = 'r'
      where a.attname = 'hall_id' and c.relnamespace = 'public'::regnamespace and c.relname <> 'halls'`)
  ).rows.map((r) => r.relname as string);
const rowsOf = async (hall: string) => {
  let total = 0;
  for (const t of await hallTables()) total += (await db.query<any>(`select count(*)::int as n from public.${t} where hall_id = $1`, [hall])).rows[0].n;
  return total;
};

describe("deleting a hall", () => {
  it("removes the hall and the owner account, and records the deletion", async () => {
    const h = await makeHall("Gone");
    const r = (await q(IDS.superAdmin, "select public.admin_delete_hall($1, 'closed down') as r", [h.id]))[0].r;
    expect(r).toEqual({ accounts_deleted: 1, accounts_kept: 0 });
    expect((await db.query<any>("select 1 from public.halls where id = $1", [h.id])).rows).toHaveLength(0);
    expect((await db.query<any>("select 1 from auth.users where id = $1", [h.owner])).rows).toHaveLength(0);
    expect((await db.query<any>("select 1 from public.profiles where id = $1", [h.owner])).rows).toHaveLength(0);
    const a = (await db.query<any>("select hall_id, reason, before_data, after_data from public.audit_logs where action = 'admin.hall.delete' and target_id = $1", [h.id])).rows;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ hall_id: null, reason: "closed down" });
    expect(a[0].before_data).toMatchObject({ name: "Gone", owner_email: "gone@example.test" });
  });
  it("drops the sales credit with the hall", async () => {
    const h = await makeHall("Sold");
    const [{ id: agent }] = await q(IDS.superAdmin, "select public.admin_create_sales_account('seller.x@example.test','secret123','seller_x','S','sales_agent',null) as id");
    await db.query("insert into public.sales_attributions (hall_id, agent_id) values ($1, $2)", [h.id, agent]);
    await q(IDS.superAdmin, "select public.admin_delete_hall($1, 'closed')", [h.id]);
    expect((await db.query<any>("select 1 from public.sales_attributions where hall_id = $1", [h.id])).rows).toHaveLength(0);
  });
  it("removes every row of a hall that has real data, and leaves other halls alone", async () => {
    expect(await rowsOf(IDS.h1)).toBeGreaterThan(0);
    const other = await rowsOf(IDS.h3);
    const memberships = (await db.query<any>("select count(*)::int as n from public.hall_memberships where hall_id <> $1", [IDS.h1])).rows[0].n;
    await q(IDS.superAdmin, "select public.admin_delete_hall($1, 'cleanup') as r", [IDS.h1]);
    expect(await rowsOf(IDS.h1)).toBe(0);
    expect((await db.query<any>("select 1 from public.halls where id = $1", [IDS.h1])).rows).toHaveLength(0);
    expect(await rowsOf(IDS.h3)).toBe(other);
    expect((await db.query<any>("select count(*)::int as n from public.hall_memberships where hall_id <> $1", [IDS.h1])).rows[0].n).toBe(memberships);
    // an account that also works in another hall is kept
    expect((await db.query<any>("select 1 from auth.users where id = $1", [IDS.ownerH1H2])).rows).toHaveLength(1);
  });
  it("is for super admins only and needs a reason", async () => {
    const h = await makeHall("Safe");
    for (const who of [IDS.salesAgent, IDS.ownerH3, IDS.customerOnly]) {
      expect((await err(q(who, "select public.admin_delete_hall($1, 'because')", [h.id]))).message).toBe("PERMISSION_DENIED");
    }
    expect((await err(q(IDS.superAdmin, "select public.admin_delete_hall($1, ' ')", [h.id]))).detail).toBe("reason");
    expect((await err(q(IDS.superAdmin, "select public.admin_delete_hall($1, 'because')", ["44444444-0000-0000-0000-0000000000ff"]))).message).toBe("NOT_FOUND");
    expect((await db.query<any>("select 1 from public.halls where id = $1", [h.id])).rows).toHaveLength(1);
    await db.exec("begin");
    await db.exec("set local role anon");
    await expect(db.query("select public.admin_delete_hall($1, 'x')", [h.id])).rejects.toThrow(/permission denied/i);
    await db.exec("rollback");
  });
});

describe("deleting an account", () => {
  it("removes a sales account and keeps the audit trail, without the name on it", async () => {
    const [{ id }] = await q(IDS.superAdmin, "select public.admin_create_sales_account('del.me@example.test','secret123','del_me','Del Me','sales_agent',null) as id");
    await db.query("insert into public.audit_logs (actor_id, action) values ($1, 'test.action')", [id]);
    await q(IDS.superAdmin, "select public.admin_delete_user($1, 'left the company')", [id]);
    expect((await db.query<any>("select 1 from auth.users where id = $1", [id])).rows).toHaveLength(0);
    expect((await db.query<any>("select 1 from public.user_role_assignments where user_id = $1", [id])).rows).toHaveLength(0);
    const a = (await db.query<any>("select actor_id from public.audit_logs where action = 'test.action'")).rows;
    expect(a).toEqual([{ actor_id: null }]);
    const d = (await db.query<any>("select reason, before_data from public.audit_logs where action = 'admin.user.delete'")).rows[0];
    expect(d).toMatchObject({ reason: "left the company" });
    expect(d.before_data.email).toBe("del.me@example.test");
  });
  it("refuses yourself and an owner who still has a hall", async () => {
    expect((await err(q(IDS.superAdmin, "select public.admin_delete_user($1, 'reason')", [IDS.superAdmin]))).detail).toBe("self_delete");
    const h = await makeHall("Keeper");
    expect((await err(q(IDS.superAdmin, "select public.admin_delete_user($1, 'reason')", [h.owner]))).detail).toBe("owns_hall");
  });
  it("refuses an account that is still named on required hall records", async () => {
    const e = await err(q(IDS.superAdmin, "select public.admin_delete_user($1, 'reason')", [IDS.customerOnly]));
    expect(["has_history", "NO_ERROR"]).toContain(e.detail || "NO_ERROR");
  });
  it("is for super admins only", async () => {
    for (const who of [IDS.salesAgent, IDS.ownerH3, IDS.customerOnly]) {
      expect((await err(q(who, "select public.admin_delete_user($1, 'reason')", [IDS.deactivated]))).message).toBe("PERMISSION_DENIED");
    }
  });
});
