import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

const SALES_ADMIN = "33333333-0000-0000-0000-0000000000a1";
const AGENT2 = "33333333-0000-0000-0000-0000000000a2";
const SUPER2 = "33333333-0000-0000-0000-0000000000a3";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
  for (const [id, email] of [
    [SALES_ADMIN, "sales.admin@example.test"],
    [AGENT2, "agent.two@example.test"],
    [SUPER2, "super.two@example.test"],
  ]) {
    await db.exec(`insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
      values ('${id}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${email}', '{}', now(), now())`);
  }
  await db.exec(`insert into public.user_role_assignments (user_id, role_key) values
    ('${SALES_ADMIN}', 'sales_admin'), ('${AGENT2}', 'sales_agent')`);
}, 60_000);
afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    truncate public.sales_attributions, public.hall_requests cascade;
    update public.halls set subscription_plan_id = (select id from public.subscription_plans where kind = 'unlimited'), subscription_price_minor = 0, subscription_currency = null where subscription_plan_id in (select id from public.subscription_plans where kind = 'priced'); delete from public.subscription_plans where kind = 'priced';
    truncate public.audit_logs;
    delete from public.user_role_assignments where user_id = '${SUPER2}';
  `);
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
const key = () => crypto.randomUUID();
const audit = async (action: string) => (await db.query<any>("select * from public.audit_logs where action = $1", [action])).rows;
let seq = 0;
const uniq = (p: string) => `${p} ${Date.now()}-${++seq}`;

const SA = IDS.superAdmin;
const AGENT = IDS.salesAgent;
const OUTSIDERS = [IDS.ownerH1H2, IDS.employeeH1, IDS.ownerH3, IDS.customerOnly, IDS.deactivated];

// A hall is created through the internal provisioning function (as the database owner), the way the
// admin and conversion RPCs do; there is no tenant any more.
const createHall = async (name = uniq("Hall"), tz = "Asia/Damascus", cur = "USD", k = key()) =>
  (await db.query<any>("select public.provision_hall($1,$2,$3,$4) as id", [name, tz, cur, k])).rows[0].id as string;

describe("platform access is super-admin only", () => {
  it("every admin RPC refuses everyone else, including sales and hall owners", async () => {
    const h = await createHall();
    const calls: [string, unknown[]][] = [
      ["select * from public.admin_platform_metrics()", []],
      ["select * from public.admin_list_halls_sold()", []],
      ["select public.admin_set_hall_status($1,'inactive','reason here')", [h]],
      ["select public.admin_invite_owner($1,'a@b.co')", [h]],
      ["select * from public.admin_list_users()", []],
      ["select * from public.admin_list_audit()", []],
      ["select public.admin_set_user_status($1,'inactive','reason here')", [AGENT]],
    ];
    for (const u of [...OUTSIDERS, AGENT, SALES_ADMIN]) {
      for (const [sql, p] of calls) expect((await err(q(u, sql, p))).message, `${u} ${sql}`).toBe("PERMISSION_DENIED");
    }
  });
  it("a super admin has no hall financial access just from the role", async () => {
    expect(await q(SA, "select * from public.invoices")).toEqual([]);
    expect(await q(SA, "select * from public.wallets")).toEqual([]);
    expect((await err(q(SA, "select * from public.report_financial_summary($1, now() - interval '1 day', now())", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
    expect((await err(q(SA, "select * from public.list_invoices($1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
  });
});

describe("halls", () => {
  it("provisions defaults (settings, register) and validates zone, currency and name", async () => {
    const k = key();
    const h = await createHall("Downtown", "Asia/Beirut", "USD", k);
    const row = (await db.query<any>("select * from public.halls where id = $1", [h])).rows[0];
    expect(row).toMatchObject({ name: "Downtown", time_zone: "Asia/Beirut", currency: "USD" });
    expect((await db.query<any>("select count(*)::int c from public.cash_registers where hall_id = $1", [h])).rows[0].c).toBe(1);
    expect((await db.query<any>("select count(*)::int c from public.hall_settings where hall_id = $1", [h])).rows[0].c).toBe(1);
    expect((await err(createHall("X", "Mars/Base"))).detail).toBe("time_zone");
    expect((await err(createHall("X", "UTC", "us"))).detail).toBe("currency");
    expect((await err(createHall(" ", "UTC", "USD"))).detail).toBe("name");
    expect((await audit("admin.hall.create")).filter((a) => a.target_id === h).length).toBe(0); // no longer audited (…000045)
  });
  it("invites an owner who can accept and then reaches the hall; the token is shown once", async () => {
    const h = await createHall();
    const [{ tok }] = await q(SA, "select public.admin_invite_owner($1,$2) as tok", [h, "customer.only@example.test"]);
    expect(tok).toHaveLength(64);
    expect((await db.query<any>("select count(*)::int c from public.hall_invitations where token_hash = $1", [tok])).rows[0].c).toBe(0);
    expect((await err(q(SA, "select public.admin_invite_owner($1,$2)", [h, "customer.only@example.test"]))).detail).toBe("already_invited");
    expect((await err(q(SA, "select public.admin_invite_owner($1,'nope')", [h]))).detail).toBe("email");
    expect((await err(q(IDS.employeeH1, "select public.accept_invitation($1)", [tok]))).message).toBe("NOT_FOUND"); // wrong account
    await q(IDS.customerOnly, "select public.accept_invitation($1)", [tok]);
    const [ctx] = await q(IDS.customerOnly, "select public.has_hall_permission($1,'hall.settings.manage') as ok", [h]);
    expect(ctx.ok).toBe(true);
  });
  it("deactivating a hall removes access to that hall only, needs a reason, is audited and retry-safe", async () => {
    const h = await createHall();
    const [{ tok }] = await q(SA, "select public.admin_invite_owner($1,$2) as tok", [h, "customer.only@example.test"]);
    await q(IDS.customerOnly, "select public.accept_invitation($1)", [tok]);
    expect((await err(q(SA, "select public.admin_set_hall_status($1,'inactive','x')", [h]))).detail).toBe("reason");
    expect((await err(q(SA, "select public.admin_set_hall_status($1,'paused','reason here')", [h]))).detail).toBe("status");
    await q(SA, "select public.admin_set_hall_status($1,'inactive','Closed for renovation')", [h]);
    await q(SA, "select public.admin_set_hall_status($1,'inactive','Closed for renovation')", [h]); // retry: no second audit
    expect((await audit("admin.hall.status")).length).toBe(1);
    expect((await q(IDS.customerOnly, "select public.is_hall_member($1) as ok", [h]))[0].ok).toBe(false);
    await q(SA, "select public.admin_set_hall_status($1,'active','Reinstated')", [h]);
    expect((await q(IDS.customerOnly, "select public.is_hall_member($1) as ok", [h]))[0].ok).toBe(true);
    expect((await audit("admin.hall.status")).map((a) => a.reason)).toEqual(expect.arrayContaining(["Closed for renovation", "Reinstated"]));
  });
  it("platform clients cannot write the tables directly", async () => {
    await expect(q(SA, "insert into public.halls (name, time_zone, currency) values ('x','UTC','USD')")).rejects.toThrow(/permission denied/i);
    await expect(q(SA, "update public.halls set status = 'inactive'")).rejects.toThrow(/permission denied/i);
  });
});

describe("users and platform roles", () => {
  it("lists users with roles; search filters", async () => {
    const rows = await q(SA, "select * from public.admin_list_users($1)", ["agent.two"]);
    expect(rows).toMatchObject([{ email: "agent.two@example.test", platform_roles: ["sales_agent"] }]);
  });
  it("super admin assigns and revokes roles by email, audited; unknown emails look like missing", async () => {
    await q(SA, "select public.admin_assign_platform_role('super.two@example.test','super_admin')");
    expect((await audit("admin.role.assign")).length).toBe(1);
    await q(SA, "select public.admin_assign_platform_role('super.two@example.test','super_admin')"); // idempotent
    expect((await audit("admin.role.assign")).length).toBe(1);
    expect((await err(q(SA, "select public.admin_assign_platform_role('nobody@example.test','sales_agent')"))).message).toBe("NOT_FOUND");
    expect((await err(q(SA, "select public.admin_assign_platform_role('super.two@example.test','owner')"))).detail).toBe("role");
    await q(SA, "select public.admin_revoke_platform_role($1,'super_admin')", [SUPER2]);
    expect((await audit("admin.role.revoke")).length).toBe(1);
  });
  it("cannot revoke your own super admin role or the last one", async () => {
    expect((await err(q(SA, "select public.admin_revoke_platform_role($1,'super_admin')", [SA]))).detail).toBe("cannot_modify_self");
    await q(SA, "select public.admin_assign_platform_role('super.two@example.test','super_admin')");
    // SUPER2 revoking SA leaves SUPER2 as the only one; revoking SUPER2 afterwards would be the last.
    await q(SUPER2, "select public.admin_revoke_platform_role($1,'super_admin')", [SA]);
    expect((await err(q(SUPER2, "select public.admin_revoke_platform_role($1,'super_admin')", [SA]))).detail).toBe("last_super_admin");
    await db.exec(`insert into public.user_role_assignments (user_id, role_key) values ('${SA}', 'super_admin') on conflict do nothing`);
  });
  it("sales admin may manage only the sales_agent role", async () => {
    await q(SALES_ADMIN, "select public.admin_assign_platform_role('customer.only@example.test','sales_agent')");
    expect((await err(q(SALES_ADMIN, "select public.admin_assign_platform_role('customer.only@example.test','super_admin')"))).message).toBe("PERMISSION_DENIED");
    expect((await err(q(SALES_ADMIN, "select public.admin_assign_platform_role('customer.only@example.test','sales_admin')"))).message).toBe("PERMISSION_DENIED");
    await q(SALES_ADMIN, "select public.admin_revoke_platform_role($1,'sales_agent')", [IDS.customerOnly]);
    expect((await err(q(AGENT, "select public.admin_assign_platform_role('customer.only@example.test','sales_agent')"))).message).toBe("PERMISSION_DENIED");
    expect((await err(q(IDS.ownerH1H2, "select public.admin_assign_platform_role('customer.only@example.test','sales_agent')"))).message).toBe("PERMISSION_DENIED");
  });
  it("deactivating a user locks them out of everything; not yourself; reason required", async () => {
    expect((await err(q(SA, "select public.admin_set_user_status($1,'inactive','reason here')", [SA]))).detail).toBe("cannot_modify_self");
    expect((await err(q(SA, "select public.admin_set_user_status($1,'inactive','x')", [IDS.employeeH1]))).detail).toBe("reason");
    await q(SA, "select public.admin_set_user_status($1,'inactive','Left the company')", [IDS.employeeH1]);
    expect((await q(IDS.employeeH1, "select public.is_hall_member($1) as ok", [IDS.h1]))[0].ok).toBe(false);
    await q(SA, "select public.admin_set_user_status($1,'active','Back')", [IDS.employeeH1]);
    expect((await audit("admin.user.status")).length).toBe(2);
  });
});

describe("platform audit", () => {
  it("lists only platform (hall-less) entries, paged and filterable", async () => {
    await q(SA, "select public.admin_create_sales_account('audit.one@example.test','secret123','audit_one','A','sales_agent',null)");
    await q(IDS.ownerH1H2, "select public.update_hall_policies($1,30,10,15,true,false,array['cash'])", [IDS.h1]).catch(() => undefined);
    const rows = await q(SA, "select * from public.admin_list_audit(25,0,'admin.user')");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.action.startsWith("admin.user"))).toBe(true);
    const all = await q(SA, "select * from public.admin_list_audit()");
    expect(all.every((r) => r.action.startsWith("admin.") || r.action.startsWith("sales."))).toBe(true);
  });
});

describe("adding halls", () => {
  const add = (user: string, name = uniq("Hall"), n = ++seq) =>
    q(user, "select public.admin_create_hall_with_owner($1,'USD',$2,'secret123',$3,$4) as id", [name, `o${n}@example.test`, `owner_${n}`, key()]).then((r) => r[0].id as string);

  it("super admins and sales managers add halls; agents and everyone else are refused", async () => {
    for (const u of [AGENT, ...OUTSIDERS]) {
      expect((await err(add(u))).message, u).toBe("PERMISSION_DENIED");
    }
    const byAdmin = await add(SA);
    const byManager = await add(SALES_ADMIN);
    const credited = (await db.query<any>("select hall_id, agent_id from public.sales_attributions")).rows;
    expect(credited).toEqual([{ hall_id: byManager, agent_id: SALES_ADMIN }]); // a super admin's hall has no seller
    expect(byAdmin).not.toBe(byManager);
  });
  it("a manager's retry with the same key returns the same hall", async () => {
    const k = key();
    const call = () => q(SALES_ADMIN, "select public.admin_create_hall_with_owner('Same','SYP','same@example.test','secret123','same_owner',$1) as id", [k]);
    expect((await call())[0].id).toBe((await call())[0].id);
  });
});

describe("subscription plans", () => {
  const save = (user: string, id: string | null, name: string, price: number, cur = "USD", k: string | null = key(), period = "monthly", details: string | null = null) =>
    q(user, "select public.admin_save_subscription_plan($1,$2,$3,$4,$5,$6,$7) as id", [id, period, name, details, price, cur, id ? null : k]).then((r) => r[0].id as string);
  const addHall = (user: string, plan: string | null, n = ++seq) =>
    q(user, "select public.admin_create_hall_with_owner($1,'USD',$2,'secret123',$3,$4,$5) as id", [uniq("Plan hall"), `plan${n}@example.test`, `plan_${n}`, key(), plan]).then((r) => r[0].id as string);
  const hallRow = async (id: string) => {
    const r = (await db.query<any>("select subscription_plan_id, subscription_price_minor, subscription_currency from public.halls where id = $1", [id])).rows[0];
    return { ...r, subscription_price_minor: r.subscription_price_minor === null ? null : Number(r.subscription_price_minor) };
  };

  it("only a super admin manages plans; the input is validated; retries return the same plan", async () => {
    for (const u of [AGENT, SALES_ADMIN, ...OUTSIDERS]) {
      expect((await err(save(u, null, "X", 100))).message, u).toBe("PERMISSION_DENIED");
      expect((await err(q(u, "select public.admin_set_subscription_plan_status($1,'inactive')", [AGENT]))).message, u).toBe("PERMISSION_DENIED");
    }
    for (const [name, price, cur, detail] of [["x".repeat(81), 100, "USD", "name"], ["A", -1, "USD", "price"], ["A", 100, "EUR", "currency"]] as const) {
      expect((await err(save(SA, null, name, price, cur))).detail).toBe(detail);
    }
    expect((await err(save(SA, null, "A", 100, "USD", key(), "weekly"))).detail).toBe("period");
    expect((await err(save(SA, null, "A", 100, "USD", key(), "monthly", "x".repeat(1001)))).detail).toBe("details");
    const k = key();
    const a = await save(SA, null, "Monthly", 2500, "USD", k);
    expect(await save(SA, null, "Monthly", 2500, "USD", k)).toBe(a);
    expect((await q(SA, "select * from public.admin_list_subscription_plans()")).filter((r) => r.name === "Monthly")).toHaveLength(1);
    expect((await audit("admin.subscription_plan.create")).length).toBe(1);
  });
  it("sales managers and employees see only active plans; outsiders see none", async () => {
    const live = await save(SA, null, "Live", 1000);
    const off = await save(SA, null, "Old", 900);
    await q(SA, "select public.admin_set_subscription_plan_status($1,'inactive')", [off]);
    const fixed = (await q(SA, "select id from public.admin_list_subscription_plans() where kind = 'unlimited'"))[0].id;
    expect((await q(SA, "select id from public.admin_list_subscription_plans()")).map((r) => r.id).sort()).toEqual([fixed, live, off].sort());
    expect((await q(SALES_ADMIN, "select id from public.admin_list_subscription_plans()")).map((r) => r.id).sort()).toEqual([fixed, live].sort());
    expect((await q(AGENT, "select id from public.admin_list_subscription_plans()")).map((r) => r.id).sort()).toEqual([fixed, live].sort());
    for (const u of OUTSIDERS) {
      expect((await err(q(u, "select * from public.admin_list_subscription_plans()"))).message, u).toBe("PERMISSION_DENIED");
    }
  });
  it("a hall keeps the price it was sold at when the plan changes later", async () => {
    const plan = await save(SA, null, "Annual", 30000, "SYP");
    const hall = await addHall(SA, plan);
    expect(await hallRow(hall)).toMatchObject({ subscription_plan_id: plan, subscription_price_minor: 30000, subscription_currency: "SYP" });
    await save(SA, plan, "Annual v2", 99999, "USD");
    expect(await hallRow(hall)).toMatchObject({ subscription_price_minor: 30000, subscription_currency: "SYP" });
    const listed = (await q(SA, "select * from public.admin_list_halls_sold()")).map((r) => ({ ...r, plan_price_minor: r.plan_price_minor === null ? null : Number(r.plan_price_minor) })).find((r) => r.hall_id === hall);
    expect(listed).toMatchObject({ plan_name: "Annual v2", plan_price_minor: 30000, plan_currency: "SYP" });
    expect((await q(SA, "select halls_count from public.admin_list_subscription_plans() where id = $1", [plan]))[0].halls_count).toBe(1);
  });
  it("several plans can share a period and differ by their details; the period is a fixed choice", async () => {
    await save(SA, null, "Basic", 1000, "USD", key(), "monthly", "1 device\nEmail support");
    await save(SA, null, "Pro", 2500, "USD", key(), "monthly", "Unlimited devices\nPhone support");
    await save(SA, null, "", 9000, "USD", key(), "annual");
    const rows = await q(SA, "select * from public.admin_list_subscription_plans() where kind = 'priced'");
    expect(rows.filter((r) => r.period === "monthly").map((r) => r.name).sort()).toEqual(["Basic", "Pro"]);
    expect(rows.find((r) => r.name === "Pro").details).toBe("Unlimited devices\nPhone support");
    expect(rows.map((r) => r.period)).toEqual(["monthly", "monthly", "annual"]); // listed by period
    expect(rows.find((r) => r.period === "annual")).toMatchObject({ name: "", details: null });
  });
  it("no hall can be without a subscription: direct inserts and requests get unlimited, and the column rejects empty", async () => {
    const [fixed] = await q(SA, "select id from public.admin_list_subscription_plans() where kind = 'unlimited'");
    const hall = await createHall();
    expect((await hallRow(hall)).subscription_plan_id).toBe(fixed.id);
    await expect(db.query("update public.halls set subscription_plan_id = null where id = $1", [hall])).rejects.toThrow(/not-null|null value/i);
    await q(SA, "select public.admin_set_sales_manager($1,$2)", [AGENT, SALES_ADMIN]);
    const id = (await q(AGENT, "select public.submit_hall_request('Via request','USD','via_req@example.test','via_req','secret123') as id"))[0].id;
    const { hall_id } = (await q(SALES_ADMIN, "select public.approve_hall_request($1,$2) as r", [id, key()]))[0].r;
    expect((await hallRow(hall_id)).subscription_plan_id).toBe(fixed.id);
  });
  it("the subscription starts when the hall is added and runs for the plan's period; unlimited never ends", async () => {
    const dates = async (id: string) =>
      (await db.query<any>("select subscription_started_at s, subscription_ends_at e, subscription_started_at + interval '1 month' m1, subscription_started_at + interval '3 months' m3, subscription_started_at + interval '6 months' m6, subscription_started_at + interval '12 months' m12 from public.halls where id = $1", [id])).rows[0];
    const same = (a: Date | null, b: Date) => expect(a?.getTime()).toBe(b.getTime());
    const monthly = await save(SA, null, "M", 100, "USD", key(), "monthly");
    const quarterly = await save(SA, null, "Q", 100, "USD", key(), "quarterly");
    const semi = await save(SA, null, "S", 100, "USD", key(), "semiannual");
    const annual = await save(SA, null, "A", 100, "USD", key(), "annual");
    for (const [plan, col] of [[monthly, "m1"], [quarterly, "m3"], [semi, "m6"], [annual, "m12"]] as const) {
      const d = await dates(await addHall(SA, plan));
      same(d.e, d[col]);
      expect(Date.now() - d.s.getTime()).toBeLessThan(60_000); // started now
    }
    const [fixed] = await q(SA, "select id from public.admin_list_subscription_plans() where kind = 'unlimited'");
    const free = await dates(await addHall(SALES_ADMIN, fixed.id));
    expect(free.e).toBeNull();
    expect(Date.now() - free.s.getTime()).toBeLessThan(60_000);
    const listed = (await q(SA, "select * from public.admin_list_halls_sold()")).filter((r) => r.plan_kind === "priced");
    expect(listed.length).toBe(4);
    expect(listed.every((r) => r.subscription_started_at && r.subscription_ends_at)).toBe(true);
  });
  it("the unlimited plan is always there, has no price, and cannot be edited or deactivated", async () => {
    const [fixed] = await q(SALES_ADMIN, "select * from public.admin_list_subscription_plans() where kind = 'unlimited'");
    expect({ ...fixed, price_minor: Number(fixed.price_minor) }).toMatchObject({ price_minor: 0, currency: null, status: "active" });
    const hall = await addHall(SALES_ADMIN, fixed.id);
    expect(await hallRow(hall)).toMatchObject({ subscription_plan_id: fixed.id, subscription_price_minor: 0, subscription_currency: null });
    expect((await q(SA, "select plan_kind from public.admin_list_halls_sold() where hall_id = $1", [hall]))[0].plan_kind).toBe("unlimited");
    expect((await err(save(SA, fixed.id, "Hacked", 5))).detail).toBe("fixed_plan");
    expect((await err(q(SA, "select public.admin_set_subscription_plan_status($1,'inactive')", [fixed.id]))).detail).toBe("fixed_plan");
  });
  it("a hall always has a subscription (unlimited when none is chosen), the plan must be active, and a sales manager can choose one too", async () => {
    const [fixed] = await q(SA, "select id from public.admin_list_subscription_plans() where kind = 'unlimited'");
    expect(await hallRow(await addHall(SA, null))).toMatchObject({ subscription_plan_id: fixed.id, subscription_price_minor: 0, subscription_currency: null });
    const plan = await save(SA, null, "Starter", 500);
    const viaManager = await addHall(SALES_ADMIN, plan);
    expect((await hallRow(viaManager)).subscription_plan_id).toBe(plan);
    await q(SA, "select public.admin_set_subscription_plan_status($1,'inactive')", [plan]);
    expect((await err(addHall(SA, plan))).detail).toBe("plan");
    expect((await err(addHall(SA, key()))).detail).toBe("plan");
    expect((await hallRow(viaManager)).subscription_plan_id).toBe(plan); // an existing hall keeps an inactive plan
  });
});

describe("hall requests", () => {
  const request = (user: string, n = ++seq, over: Record<string, string> = {}) =>
    q(user, "select public.submit_hall_request($1,$2,$3,$4,$5) as id", [
      over.name ?? uniq("Hall"), over.currency ?? "USD", over.email ?? `req${n}@example.test`, over.username ?? `req_${n}`, over.password ?? "secret123",
    ]).then((r) => r[0].id as string);
  const setManager = (agent: string, manager: string | null) => q(SA, "select public.admin_set_sales_manager($1,$2)", [agent, manager]);

  it("the request asks for a plan and the approved hall gets exactly that plan, starting at the approval", async () => {
    const [fixed] = await q(SA, "select id from public.admin_list_subscription_plans() where kind = 'unlimited'");
    const quarterly = (await q(SA, "select public.admin_save_subscription_plan(null,'quarterly','Pro',null,5000,'USD',$1) as id", [key()]))[0].id as string;
    const off = (await q(SA, "select public.admin_save_subscription_plan(null,'annual','Old',null,9000,'USD',$1) as id", [key()]))[0].id as string;
    await q(SA, "select public.admin_set_subscription_plan_status($1,'inactive')", [off]);
    const ask = (n: number, plan: string | null) =>
      q(AGENT, "select public.submit_hall_request($1,'USD',$2,$3,'secret123',$4) as id", [`Plan req ${n}`, `pr${n}@example.test`, `pr_${n}`, plan]).then((r) => r[0].id as string);
    expect((await err(ask(1, off))).detail).toBe("plan"); // only active plans can be asked for
    expect((await err(ask(2, key()))).detail).toBe("plan");
    const id = await ask(3, quarterly);
    expect((await q(AGENT, "select plan_period, plan_kind from public.list_hall_requests()")).find(Boolean)).toMatchObject({ plan_period: "quarterly", plan_kind: "priced" });
    await setManager(AGENT, SALES_ADMIN);
    const { hall_id } = (await q(SALES_ADMIN, "select public.approve_hall_request($1,$2) as r", [id, key()]))[0].r;
    const hall = (await db.query<any>("select subscription_plan_id p, subscription_price_minor::int c, subscription_currency cur, subscription_started_at s, subscription_ends_at e, subscription_started_at + interval '3 months' m3 from public.halls where id = $1", [hall_id])).rows[0];
    expect(hall).toMatchObject({ p: quarterly, c: 5000, cur: "USD" });
    expect(hall.e.getTime()).toBe(hall.m3.getTime());
    expect(Date.now() - hall.s.getTime()).toBeLessThan(60_000);
    // a request with no choice becomes unlimited
    const none = await ask(4, null);
    const { hall_id: free } = (await q(SALES_ADMIN, "select public.approve_hall_request($1,$2) as r", [none, key()]))[0].r;
    expect((await db.query<any>("select subscription_plan_id p, subscription_ends_at e from public.halls where id = $1", [free])).rows[0]).toMatchObject({ p: fixed.id, e: null });
  });
  it("a request for a plan that was deactivated cannot be approved, only rejected", async () => {
    const plan = (await q(SA, "select public.admin_save_subscription_plan(null,'monthly','Gone',null,700,'USD',$1) as id", [key()]))[0].id as string;
    await setManager(AGENT, SALES_ADMIN);
    const id = (await q(AGENT, "select public.submit_hall_request('Gone plan','USD','gone_plan@example.test','gone_plan','secret123',$1) as id", [plan]))[0].id as string;
    expect((await q(SALES_ADMIN, "select plan_available from public.list_hall_requests() where id = $1", [id]))[0].plan_available).toBe(true);
    await q(SA, "select public.admin_set_subscription_plan_status($1,'inactive')", [plan]);
    expect((await q(SALES_ADMIN, "select plan_available from public.list_hall_requests() where id = $1", [id]))[0].plan_available).toBe(false);
    const before = (await db.query<any>("select count(*)::int n from public.halls")).rows[0].n;
    for (const user of [SALES_ADMIN, SA]) {
      expect((await err(q(user, "select public.approve_hall_request($1,$2)", [id, key()]))).detail, user).toBe("plan_inactive");
    }
    expect((await db.query<any>("select count(*)::int n from public.halls")).rows[0].n).toBe(before);
    expect((await db.query<any>("select count(*)::int n from auth.users where email = 'gone_plan@example.test'")).rows[0].n).toBe(0);
    await q(SALES_ADMIN, "select public.reject_hall_request($1,'Plan no longer offered')", [id]);
    expect((await db.query<any>("select status from public.hall_requests where id = $1", [id])).rows[0].status).toBe("rejected");
    // reactivating the plan does not revive a request that was already rejected
    await q(SA, "select public.admin_set_subscription_plan_status($1,'active')", [plan]);
    expect((await q(SALES_ADMIN, "select plan_available from public.list_hall_requests() where id = $1", [id]))[0].plan_available).toBe(true);
  });
  it("an agent sends a request; it is validated and stores only a password hash", async () => {
    const id = await request(AGENT);
    const row = (await db.query<any>("select * from public.hall_requests where id = $1", [id])).rows[0];
    expect(row).toMatchObject({ status: "pending", requested_by: AGENT });
    expect(row.owner_password_hash).toMatch(/^\$2/);
    expect(row.owner_password_hash).not.toContain("secret123");
    for (const [over, detail] of [
      [{ name: " " }, "hall_name"], [{ currency: "eur" }, "currency"], [{ email: "bad" }, "email"],
      [{ username: "x" }, "username"], [{ password: "short" }, "password"],
    ] as const) expect((await err(request(AGENT, ++seq, over))).detail).toBe(detail);
    for (const u of [...OUTSIDERS, SA]) expect((await err(request(u))).message, u).toBe("PERMISSION_DENIED");
  });
  it("owner email and username cannot repeat across waiting requests or accounts", async () => {
    await request(AGENT, 900);
    expect((await err(request(AGENT, 901, { email: "req900@example.test" }))).detail).toBe("email_taken");
    expect((await err(request(AGENT, 902, { username: "req_900" }))).detail).toBe("username_taken");
    expect((await err(request(AGENT, 903, { email: "customer.only@example.test" }))).detail).toBe("email_taken");
  });
  it("the agent's manager approves once: hall, owner account and sales credit appear and the password is erased", async () => {
    await setManager(AGENT, SALES_ADMIN);
    const id = await request(AGENT);
    expect((await q(SALES_ADMIN, "select * from public.list_hall_requests()")).find((r) => r.id === id)).toMatchObject({ can_act: true });
    expect((await q(AGENT, "select * from public.list_hall_requests()")).find((r) => r.id === id)).toMatchObject({ can_act: false });
    expect((await err(q(AGENT, "select public.approve_hall_request($1,$2)", [id, key()]))).message).toBe("PERMISSION_DENIED");
    const res = (await q(SALES_ADMIN, "select public.approve_hall_request($1,$2) as r", [id, key()]))[0].r;
    expect(res.status).toBe("approved");
    const row = (await db.query<any>("select * from public.hall_requests where id = $1", [id])).rows[0];
    expect(row).toMatchObject({ status: "approved", hall_id: res.hall_id, owner_password_hash: null, manager_approved_by: SALES_ADMIN });
    expect((await db.query<any>("select 1 from public.hall_memberships where hall_id = $1 and role_key = 'owner'", [res.hall_id])).rows).toHaveLength(1);
    expect((await db.query<any>("select agent_id from public.sales_attributions where hall_id = $1", [res.hall_id])).rows).toEqual([{ agent_id: AGENT }]);
    expect((await err(q(SALES_ADMIN, "select public.approve_hall_request($1,$2)", [id, key()]))).detail).toBe("not_pending");
  });
  it("a super admin can decide any request; another manager cannot decide someone else's", async () => {
    await setManager(AGENT, SALES_ADMIN);
    const id = await request(AGENT);
    await db.exec(`insert into public.user_role_assignments (user_id, role_key) values ('${AGENT2}', 'sales_admin')`);
    try {
      expect((await err(q(AGENT2, "select public.approve_hall_request($1,$2)", [id, key()]))).message).toBe("PERMISSION_DENIED");
    } finally {
      await db.exec(`delete from public.user_role_assignments where user_id = '${AGENT2}' and role_key = 'sales_admin'`);
    }
    expect((await q(SA, "select public.approve_hall_request($1,$2) as r", [id, key()]))[0].r.status).toBe("approved");
  });
  it("rejecting needs a reason and erases the stored password", async () => {
    await setManager(AGENT, SALES_ADMIN);
    const id = await request(AGENT);
    expect((await err(q(SALES_ADMIN, "select public.reject_hall_request($1,'no')", [id]))).detail).toBe("reason");
    await q(SALES_ADMIN, "select public.reject_hall_request($1,'Not a real hall')", [id]);
    expect((await db.query<any>("select status, rejected_reason, owner_password_hash from public.hall_requests where id = $1", [id])).rows[0])
      .toEqual({ status: "rejected", rejected_reason: "Not a real hall", owner_password_hash: null });
    expect((await err(q(SA, "select public.approve_hall_request($1,$2)", [id, key()]))).detail).toBe("not_pending");
  });
  it("agents see only their own requests; an agent without a manager is reviewed by any sales manager", async () => {
    await setManager(AGENT, null);
    const mine = await request(AGENT);
    expect((await q(AGENT, "select id from public.list_hall_requests()")).map((r) => r.id)).toEqual([mine]);
    expect(await q(AGENT2, "select id from public.list_hall_requests()")).toEqual([]);
    expect((await q(SALES_ADMIN, "select * from public.list_hall_requests()")).find((r) => r.id === mine)).toMatchObject({ can_act: true });
  });
});

describe("managers and their employees", () => {
  it("only a super admin assigns a manager, and only a real manager to a real employee", async () => {
    for (const u of [AGENT, SALES_ADMIN, ...OUTSIDERS]) {
      expect((await err(q(u, "select public.admin_set_sales_manager($1,$2)", [AGENT, SALES_ADMIN]))).message, u).toBe("PERMISSION_DENIED");
    }
    expect((await err(q(SA, "select public.admin_set_sales_manager($1,$2)", [AGENT, AGENT2]))).detail).toBe("manager");
    expect((await err(q(SA, "select public.admin_set_sales_manager($1,$2)", [SALES_ADMIN, SALES_ADMIN]))).detail).toBe("agent");
    await q(SA, "select public.admin_set_sales_manager($1,$2)", [AGENT, SALES_ADMIN]);
    expect((await audit("admin.user.set_sales_manager")).length).toBe(1);
  });
  it("an employee sees their manager, a manager sees their team, and unassigning clears both", async () => {
    await q(SA, "select public.admin_set_sales_manager($1,$2)", [AGENT, SALES_ADMIN]);
    expect(await q(AGENT, "select email from public.my_sales_manager()")).toEqual([{ email: "sales.admin@example.test" }]);
    expect((await q(SALES_ADMIN, "select user_id from public.list_my_team()")).map((r) => r.user_id)).toEqual([AGENT]);
    expect((await err(q(AGENT, "select * from public.list_my_team()"))).message).toBe("PERMISSION_DENIED");
    await q(SA, "select public.admin_set_sales_manager($1,null)", [AGENT]);
    expect(await q(AGENT, "select * from public.my_sales_manager()")).toEqual([]);
    expect(await q(SALES_ADMIN, "select * from public.list_my_team()")).toEqual([]);
  });
  it("moving an employee moves their waiting requests to the new manager", async () => {
    await q(SA, "select public.admin_set_sales_manager($1,$2)", [AGENT, SALES_ADMIN]);
    const id = (await q(AGENT, "select public.submit_hall_request('Moved','USD','moved@example.test','moved_owner','secret123') as id"))[0].id;
    await q(SA, "select public.admin_set_sales_manager($1,null)", [AGENT]);
    expect((await db.query<any>("select manager_id from public.hall_requests where id = $1", [id])).rows).toEqual([{ manager_id: null }]);
  });
  it("lists the employees for a manager and the sold halls with who sold them", async () => {
    expect((await q(SALES_ADMIN, "select * from public.list_sales_agents()")).map((r) => r.email)).toEqual(
      expect.arrayContaining(["agent.two@example.test"]),
    );
    expect((await err(q(AGENT, "select * from public.list_sales_agents()"))).message).toBe("PERMISSION_DENIED");
    const hall = await createHall();
    await db.query("insert into public.sales_attributions (hall_id, agent_id) values ($1,$2)", [hall, AGENT]);
    expect((await q(SALES_ADMIN, "select hall_id, hall_name from public.list_sales_credits()")).map((r) => r.hall_id)).toEqual([hall]);
    expect((await err(q(AGENT, "select * from public.list_sales_credits()"))).message).toBe("PERMISSION_DENIED");
  });
});

describe("sales users never reach finance (REQ-SALES-05)", () => {
  it("agents and the sales admin are refused every hall financial RPC and read nothing", async () => {
    for (const u of [AGENT, SALES_ADMIN]) {
      for (const sql of [
        "select * from public.list_invoices($1)", "select * from public.list_wallets($1)", "select * from public.list_shifts($1)",
        "select * from public.list_registers($1)", "select * from public.list_refunds($1)",
        "select * from public.report_financial_summary($1, now() - interval '1 day', now())",
      ]) expect((await err(q(u, sql, [IDS.h1]))).message, `${u} ${sql}`).toBe("PERMISSION_DENIED");
      for (const t of ["invoices", "payments", "wallets", "wallet_transactions", "refunds", "shifts", "cash_movements", "halls", "hall_memberships"]) {
        expect(await q(u, `select * from public.${t}`), t).toEqual([]);
      }
    }
  });
});
