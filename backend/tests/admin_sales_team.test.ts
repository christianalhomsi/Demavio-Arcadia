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
const create = (user: string, email: string, role = "sales_agent", username = "agent_one", resp: string | null = null) =>
  q(user, "select public.admin_create_sales_account($1, $2, $3, $4, $5, $6) as id", [email, "secret123", username, "Agent One", role, resp]);

describe("super admin creates sales accounts", () => {
  it("creates a sign-in, a profile, the role and a responsible person", async () => {
    const [{ id }] = await create(IDS.superAdmin, "New.Agent@Example.test");
    const u = (await db.query<any>("select email, encrypted_password, email_confirmed_at from auth.users where id = $1", [id])).rows[0];
    expect(u.email).toBe("new.agent@example.test");
    expect(u.encrypted_password).toMatch(/^\$2[aby]\$/); // hashed, never the plain password
    expect(u.encrypted_password).not.toContain("secret123");
    expect(u.email_confirmed_at).not.toBeNull();
    expect((await db.query<any>("select 1 from auth.identities where user_id = $1 and provider = 'email'", [id])).rows).toHaveLength(1);
    const p = (await db.query<any>("select username, display_name, responsible_id, status from public.profiles where id = $1", [id])).rows[0];
    expect(p).toMatchObject({ username: "agent_one", display_name: "Agent One", responsible_id: IDS.superAdmin, status: "active" });
    expect((await db.query<any>("select role_key from public.user_role_assignments where user_id = $1", [id])).rows).toEqual([{ role_key: "sales_agent" }]);
  });
  it("never writes the password into the audit trail", async () => {
    const rows = (await db.query<any>("select after_data::text as d from public.audit_logs where action = 'admin.user.create_sales'")).rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.d).not.toContain("secret123");
  });
  it("can name a sales admin as the responsible person", async () => {
    const [{ id: boss }] = await create(IDS.superAdmin, "boss@example.test", "sales_admin", "the_boss");
    const [{ id }] = await create(IDS.superAdmin, "under@example.test", "sales_agent", "under_boss", boss);
    const team = await q<any>(IDS.superAdmin, "select * from public.admin_list_sales_team()");
    const row = team.find((t) => t.user_id === id);
    expect(row.responsible_id).toBe(boss);
    expect(row.role_key).toBe("sales_agent");
    expect(team.find((t) => t.user_id === boss).role_key).toBe("sales_admin");
  });
  it("rejects bad input and duplicates", async () => {
    expect((await err(create(IDS.superAdmin, "x@example.test", "owner"))).detail).toBe("role");
    expect((await err(create(IDS.superAdmin, "not-an-email"))).detail).toBe("email");
    expect((await err(q(IDS.superAdmin, "select public.admin_create_sales_account('p@example.test','short','pw_user','P','sales_agent',null)"))).detail).toBe("password");
    expect((await err(create(IDS.superAdmin, "bad@example.test", "sales_agent", "ab"))).detail).toBe("username");
    expect((await err(create(IDS.superAdmin, "NEW.agent@example.test", "sales_agent", "another_one"))).detail).toBe("email_taken");
    expect((await err(create(IDS.superAdmin, "dup@example.test", "sales_agent", "agent_one"))).detail).toBe("username_taken");
    expect((await err(create(IDS.superAdmin, "r@example.test", "sales_agent", "resp_none", IDS.customerOnly))).detail).toBe("responsible");
  });
  it("is refused for everyone but a super admin, and closed to anonymous callers", async () => {
    const [{ id: agent }] = await create(IDS.superAdmin, "caller@example.test", "sales_agent", "caller_one");
    const [{ id: boss }] = await create(IDS.superAdmin, "caller2@example.test", "sales_admin", "caller_two");
    for (const who of [agent, boss, IDS.salesAgent, IDS.ownerH1H2, IDS.customerOnly]) {
      expect((await err(create(who, "z@example.test", "sales_agent", "z_user"))).message).toBe("PERMISSION_DENIED");
      expect((await err(q(who, "select * from public.admin_list_sales_team()"))).message).toBe("PERMISSION_DENIED");
      expect((await err(q(who, "select * from public.admin_list_halls_sold()"))).message).toBe("PERMISSION_DENIED");
    }
    await db.exec("begin");
    await db.exec("set local role anon");
    await expect(db.query("select public.admin_create_sales_account('a@b.cc','secret123','anon_user','A','sales_agent',null)")).rejects.toThrow(/permission denied/i);
    await db.exec("rollback");
  });
});

describe("who sold each hall", () => {
  it("lists halls with the attributed sales person, or none for direct halls", async () => {
    const [{ id: agent }] = await create(IDS.superAdmin, "seller@example.test", "sales_agent", "seller_one");
    const hall = (await db.query<any>("select h.id, h.name from public.halls h order by h.created_at limit 1")).rows[0];
    await db.query("insert into public.sales_attributions (hall_id, agent_id) values ($1, $2)", [hall.id, agent]);
    const rows = await q<any>(IDS.superAdmin, "select * from public.admin_list_halls_sold()");
    expect(rows.find((r) => r.hall_id === hall.id)).toMatchObject({ sold_by_id: agent, sold_by_email: "seller@example.test" });
    expect(rows.some((r) => r.sold_by_id === null)).toBe(true);
    const team = await q<any>(IDS.superAdmin, "select * from public.admin_list_sales_team()");
    expect(team.find((t) => t.user_id === agent).halls_sold).toBeGreaterThanOrEqual(1);
    const found = await q<any>(IDS.superAdmin, "select * from public.admin_list_halls_sold($1)", ["seller@example"]);
    expect(found.every((r) => r.sold_by_id === agent)).toBe(true);
  });
});

describe("a hall with its owner account", () => {
  const KEY = "44444444-0000-0000-0000-000000000001";
  const make = (user: string, over: Record<string, string> = {}) =>
    q(user, "select public.admin_create_hall_with_owner($1, $2, $3, $4, $5, $6) as id", [
      over.name ?? "Nova Hall", over.currency ?? "SYP", over.email ?? "nova@example.test",
      over.password ?? "secret123", over.username ?? "nova_owner", over.key ?? KEY,
    ]);
  it("creates the hall in Damascus time, with an owner who can sign in", async () => {
    const [{ id }] = await make(IDS.superAdmin);
    const h = (await db.query<any>("select name, time_zone, currency, status from public.halls where id = $1", [id])).rows[0];
    expect(h).toMatchObject({ name: "Nova Hall", time_zone: "Asia/Damascus", currency: "SYP", status: "active" });
    const o = (await db.query<any>(
      "select p.id, p.email, p.username, m.role_key, u.encrypted_password from public.hall_memberships m join public.profiles p on p.id = m.user_id join auth.users u on u.id = p.id where m.hall_id = $1", [id])).rows;
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ email: "nova@example.test", username: "nova_owner", role_key: "owner" });
    expect(o[0].encrypted_password).toMatch(/^\$2[aby]\$/);
    const ctx = (await q(o[0].id, "select public.get_my_context() as c"))[0].c;
    expect(ctx.memberships).toHaveLength(1);
    expect(ctx.memberships[0]).toMatchObject({ hall_id: id, role: "owner" });
  });
  it("is retry-safe with the same key", async () => {
    await make(IDS.superAdmin);
    expect((await db.query<any>("select count(*)::int as n from public.halls where name = 'Nova Hall'")).rows[0].n).toBe(1);
  });
  it("only accepts SYP or USD and valid owner details", async () => {
    const k = (n: number) => "44444444-0000-0000-0000-00000000010" + n;
    expect((await err(make(IDS.superAdmin, { key: k(1), currency: "EUR", email: "e1@example.test", username: "e_one" }))).detail).toBe("currency");
    expect((await err(make(IDS.superAdmin, { key: k(2), name: " ", email: "e2@example.test", username: "e_two" }))).detail).toBe("name");
    expect((await err(make(IDS.superAdmin, { key: k(3), email: "nova@example.test", username: "e_three" }))).detail).toBe("email_taken");
    expect((await err(make(IDS.superAdmin, { key: k(4), email: "e4@example.test", username: "nova_owner" }))).detail).toBe("username_taken");
    expect((await err(make(IDS.superAdmin, { key: k(5), email: "e5@example.test", username: "e_five", password: "short" }))).detail).toBe("password");
    expect((await db.query<any>("select count(*)::int as n from auth.users where email like 'e_@example.test'")).rows[0].n).toBe(0);
  });
  it("is for super admins only", async () => {
    for (const who of [IDS.salesAgent, IDS.ownerH1H2, IDS.customerOnly]) {
      expect((await err(make(who, { key: "44444444-0000-0000-0000-000000000999", email: "x@example.test", username: "x_user" }))).message).toBe("PERMISSION_DENIED");
    }
  });
  it("lists the owner next to the hall", async () => {
    const rows = await q<any>(IDS.superAdmin, "select * from public.admin_list_halls_sold($1)", ["nova@example"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ hall_name: "Nova Hall", owner_email: "nova@example.test", currency: "SYP" });
  });
});
