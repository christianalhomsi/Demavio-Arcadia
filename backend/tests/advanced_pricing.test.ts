import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

const D = {
  pc1: "44444444-0000-0000-0000-000000000001", // H1, Standard -> hall rate 600/h
  pc2: "44444444-0000-0000-0000-000000000002", // H1, VIP
  h3pc: "44444444-0000-0000-0000-000000000004", // H3
};
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    truncate public.sessions, public.reservations, public.wallets cascade;
    truncate public.packages, public.discounts, public.pricing_windows cascade;
    truncate public.agent_commands cascade;
    truncate public.invoice_counters;
    truncate public.audit_logs;
    truncate public.shifts, public.cash_movements cascade;
    delete from public.pricing_rules where scope = 'device';
    update public.hall_settings set allow_partial_payments = true, payment_methods = array['cash','wallet'],
      billing_increment_minutes = 1, min_billable_minutes = 0;
    update public.pricing_rules set rate_per_hour_minor = 600 where scope = 'hall';
    update public.pricing_rules set rate_per_hour_minor = 900 where scope = 'category';
    update public.hall_memberships set discount_limit_minor = null;
    update public.halls set time_zone = 'UTC' where id = '${IDS.h1}';
  `);
  await q(IDS.employeeH1, "select public.open_shift($1, null, 0, $2)", [IDS.h1, crypto.randomUUID()]);
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
const n = (v: unknown) => Number(v);
const audit = async (action: string) => (await db.query<any>("select * from public.audit_logs where action = $1", [action])).rows;

const OWNER = IDS.ownerH1H2;

async function endedInvoice(device = D.pc1, minutes = 60) {
  const [{ id }] = await q(IDS.employeeH1, "select public.start_walk_in($1,$2,'open',null,null,'Walk-in',$3) as id", [IDS.h1, device, key()]);
  await db.exec(`update public.sessions set started_at = now() - interval '${minutes} minutes' where id = '${id}'`);
  await q(IDS.employeeH1, "select public.end_session($1,'normal',null)", [id]);
  return (await db.query<any>("select * from public.invoices where session_id = $1", [id])).rows[0];
}
const lines = async (invoiceId: string) =>
  (await db.query<any>("select description, amount_minor, detail from public.invoice_items where invoice_id = $1 order by amount_minor desc", [invoiceId])).rows;
const segments = async (start: string, minutes: number, base: number, windows: unknown, tz = "UTC") =>
  (await db.query<any>("select * from public.compute_segments($1::timestamptz, $2, $3, $4::jsonb, $5)", [start, minutes, base, JSON.stringify(windows), tz])).rows.map((r) => ({
    rate: n(r.rate_per_hour_minor),
    minutes: r.minutes,
    amount: n(r.amount_minor),
  }));

const evening = [{ days: ALL_DAYS, start: 1080, end: 1440, rate: 1200 }];

describe("pricing windows: per-segment billing", () => {
  it("bills each part of a session at the rate of the window it falls in", async () => {
    // Monday 17:30 UTC, 60 minutes: half before and half after the 18:00 window.
    expect(await segments("2026-01-05T17:30:00Z", 60, 600, evening)).toEqual([
      { rate: 600, minutes: 30, amount: 300 },
      { rate: 1200, minutes: 30, amount: 600 },
    ]);
  });
  it("uses the hall time zone and weekdays, and falls back to the base rate", async () => {
    // 17:30Z is 20:30 in UTC+3, so the whole hour is inside the evening window.
    expect(await segments("2026-01-05T17:30:00Z", 60, 600, evening, "Asia/Damascus")).toEqual([{ rate: 1200, minutes: 60, amount: 1200 }]);
    // Monday is day 1; a Tuesday-only window never applies.
    expect(await segments("2026-01-05T19:00:00Z", 60, 600, [{ days: [2], start: 0, end: 1440, rate: 1200 }])).toEqual([{ rate: 600, minutes: 60, amount: 600 }]);
    expect(await segments("2026-01-05T19:00:00Z", 0, 600, evening)).toEqual([]);
  });
  it("rounds each segment up to the next minor unit", async () => {
    expect(await segments("2026-01-05T17:59:00Z", 2, 100, evening)).toEqual([
      { rate: 100, minutes: 1, amount: 2 },
      { rate: 1200, minutes: 1, amount: 20 },
    ]);
  });

  it("snapshots windows at session start; later edits change nothing", async () => {
    await q(OWNER, "select public.upsert_pricing_window($1,null,'hall',null,null,$2,0,1440,1200)", [IDS.h1, ALL_DAYS]);
    const inv = await endedInvoice(D.pc1, 60);
    expect(n(inv.total_minor)).toBe(1200); // whole day in the window: 60 min at 1200/h
    const [line] = await lines(inv.id);
    expect(line.detail).toMatchObject({ kind: "session", billed_minutes: 60, rate_per_hour_minor: 1200 });

    const [{ id: win }] = await q(OWNER, "select id from public.list_pricing_windows($1)", [IDS.h1]);
    await q(OWNER, "select public.delete_pricing_window($1)", [win]);
    expect(n((await db.query<any>("select total_minor from public.invoices where id = $1", [inv.id])).rows[0].total_minor)).toBe(1200);
    expect(n((await endedInvoice(D.pc1, 60)).total_minor)).toBe(600); // new sessions: no window left
  });
  it("device windows win over category and hall windows", async () => {
    await q(OWNER, "select public.upsert_pricing_window($1,null,'hall',null,null,$2,0,1440,2000)", [IDS.h1, ALL_DAYS]);
    await q(OWNER, "select public.upsert_pricing_window($1,null,'device',$2,null,$3,0,1440,3000)", [IDS.h1, D.pc1, ALL_DAYS]);
    expect(n((await endedInvoice(D.pc1, 60)).total_minor)).toBe(3000);
    expect(n((await endedInvoice(D.pc2, 60)).total_minor)).toBe(2000); // pc2 has no device window: hall windows
  });
});

describe("pricing windows: management", () => {
  const win = (user: string, over: Partial<{ id: string | null; scope: string; dev: string | null; cat: string | null; days: number[]; s: number; e: number; rate: number }> = {}) => {
    const o = { id: null, scope: "hall", dev: null, cat: null, days: [1, 2], s: 600, e: 720, rate: 900, ...over };
    return q(user, "select public.upsert_pricing_window($1,$2,$3,$4,$5,$6,$7,$8,$9) as id", [IDS.h1, o.id, o.scope, o.dev, o.cat, o.days, o.s, o.e, o.rate]).then((r) => r[0].id as string);
  };
  it("only owners with settings access manage windows", async () => {
    for (const u of [IDS.employeeH1, IDS.ownerH3, IDS.salesAgent, IDS.superAdmin, IDS.formerEmployeeH1]) {
      expect((await err(win(u))).message).toBe("PERMISSION_DENIED");
      expect((await err(q(u, "select * from public.list_pricing_windows($1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
    }
    await win(OWNER);
    expect((await q(OWNER, "select * from public.list_pricing_windows($1)", [IDS.h1])).length).toBe(1);
    expect((await audit("pricing.window.set")).length).toBe(1);
  });
  it("validates days, range, rate, scope and targets", async () => {
    expect((await err(win(OWNER, { days: [] }))).detail).toBe("days");
    expect((await err(win(OWNER, { days: [0] }))).detail).toBe("days");
    expect((await err(win(OWNER, { days: [1, 1] }))).detail).toBe("days");
    expect((await err(win(OWNER, { s: 700, e: 700 }))).detail).toBe("window_range");
    expect((await err(win(OWNER, { s: 700, e: 600 }))).detail).toBe("window_range");
    expect((await err(win(OWNER, { e: 1441 }))).detail).toBe("window_range");
    expect((await err(win(OWNER, { rate: -1 }))).detail).toBe("rate");
    expect((await err(win(OWNER, { scope: "weekend" }))).detail).toBe("scope");
    expect((await err(win(OWNER, { scope: "category" }))).detail).toBe("category");
    expect((await err(win(OWNER, { scope: "device", dev: D.h3pc }))).message).toBe("NOT_FOUND");
  });
  it("rejects overlapping windows on one target but allows other targets and adjacent ranges", async () => {
    const a = await win(OWNER, { s: 600, e: 720 });
    expect((await err(win(OWNER, { s: 700, e: 800 }))).detail).toBe("window_overlap");
    await win(OWNER, { s: 720, e: 800 }); // adjacent, fine
    await win(OWNER, { days: [3], s: 600, e: 720 }); // other day, fine
    await win(OWNER, { scope: "category", cat: "VIP", s: 600, e: 720 }); // other target, fine
    await win(OWNER, { id: a, s: 600, e: 700 }); // editing itself never conflicts with itself
    expect((await err(win(OWNER, { id: a, s: 600, e: 760 }))).detail).toBe("window_overlap"); // would hit 720-800
  });
  it("is audited on delete and clients cannot write the table", async () => {
    const id = await win(OWNER);
    await q(OWNER, "select public.delete_pricing_window($1)", [id]);
    expect((await audit("pricing.window.delete")).length).toBe(1);
    expect((await err(q(OWNER, "insert into public.pricing_windows (hall_id, scope, days, start_minute, end_minute, rate_per_hour_minor) values ($1,'hall','{1}',0,60,1)", [IDS.h1]))).message).toMatch(/permission denied/i);
  });
});

describe("packages", () => {
  const pkg = (over: Partial<{ id: string | null; name: string; dur: number; price: number; dev: string | null; cat: string | null; from: number | null; to: number | null; vf: string | null; vu: string | null; max: number | null; active: boolean }> = {}, user = OWNER) => {
    const o = { id: null, name: "Three hours", dur: 180, price: 500, dev: null, cat: null, from: null, to: null, vf: null, vu: null, max: null, active: true, ...over };
    return q(user, "select public.upsert_package($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as id", [IDS.h1, o.id, o.name, o.dur, o.price, o.dev, o.cat, o.from, o.to, o.vf, o.vu, o.max, o.active]).then((r) => r[0].id as string);
  };
  const start = (id: string, device = D.pc1, k = key(), user = IDS.employeeH1) =>
    q(user, "select public.start_package_session($1,$2,$3,null,'Guest',$4) as id", [IDS.h1, id, device, k]).then((r) => r[0].id as string);
  const end = (session: string) => q(IDS.employeeH1, "select public.end_session($1,'normal',null)", [session]);
  const invoiceOf = async (session: string) => (await db.query<any>("select * from public.invoices where session_id = $1", [session])).rows[0];

  it("only owners manage packages; staff who start sessions can list them", async () => {
    expect((await err(pkg({}, IDS.employeeH1))).message).toBe("PERMISSION_DENIED");
    expect((await err(pkg({}, IDS.ownerH3))).message).toBe("PERMISSION_DENIED");
    await pkg();
    expect((await q(IDS.employeeH1, "select * from public.list_packages($1)", [IDS.h1])).length).toBe(1);
    expect((await err(q(IDS.salesAgent, "select * from public.list_packages($1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
    expect((await err(q(IDS.employeeH1, "select * from public.list_package_uses($1)", [await pkg({ name: "x" })]))).message).toBe("PERMISSION_DENIED");
  });
  it("validates the definition and keeps names unique per hall", async () => {
    expect((await err(pkg({ name: " " }))).detail).toBe("name");
    expect((await err(pkg({ dur: 4 }))).detail).toBe("duration");
    expect((await err(pkg({ dur: 721 }))).detail).toBe("duration");
    expect((await err(pkg({ price: -1 }))).detail).toBe("price");
    expect((await err(pkg({ dev: D.pc1, cat: "VIP" }))).detail).toBe("package_target");
    expect((await err(pkg({ dev: D.h3pc }))).message).toBe("NOT_FOUND");
    expect((await err(pkg({ from: 600, to: null }))).detail).toBe("window_range");
    expect((await err(pkg({ from: 700, to: 600 }))).detail).toBe("window_range");
    expect((await err(pkg({ vf: "2026-02-01T00:00:00Z", vu: "2026-01-01T00:00:00Z" }))).detail).toBe("validity");
    expect((await err(pkg({ max: 0 }))).detail).toBe("max_uses");
    await pkg();
    expect((await err(pkg({ name: "three HOURS" }))).detail).toBe("package_name_taken");
  });

  it("a package session costs the fixed price and records its use", async () => {
    const p = await pkg();
    const s = await start(p);
    expect((await db.query<any>("select session_type from public.sessions where id = $1", [s])).rows[0].session_type).toBe("fixed");
    await end(s);
    const inv = await invoiceOf(s);
    expect(n(inv.total_minor)).toBe(500);
    expect((await lines(inv.id)).map((x) => [x.description, n(x.amount_minor)])).toEqual([["Three hours", 500]]);
    const uses = await q(OWNER, "select * from public.list_package_uses($1)", [p]);
    expect(uses).toHaveLength(1);
    expect(n(uses[0].price_minor)).toBe(500);
    expect(n((await q(OWNER, "select uses from public.list_packages($1)", [IDS.h1]))[0].uses)).toBe(1);
  });
  it("time beyond the package is billed at the regular hourly rate", async () => {
    const p = await pkg({ dur: 60, price: 400 });
    const s = await start(p);
    // 80 minutes have passed: 60 are covered by the package, 20 are extra at 600/h = 200.
    await db.exec(`update public.sessions set started_at = now() - interval '80 minutes', scheduled_end_at = now() - interval '20 minutes' where id = '${s}'`);
    await end(s);
    const inv = await invoiceOf(s);
    expect(n(inv.total_minor)).toBe(600);
    const l = await lines(inv.id);
    expect(l.map((x) => n(x.amount_minor))).toEqual([400, 200]);
    expect(l[1].detail).toMatchObject({ kind: "session", overtime: true, billed_minutes: 20 });
  });
  it("starting another package session is a separate priced session", async () => {
    const p = await pkg({ dur: 60, price: 400 });
    const s1 = await start(p);
    await end(s1);
    const s2 = await start(p);
    await end(s2);
    expect(n((await invoiceOf(s1)).total_minor) + n((await invoiceOf(s2)).total_minor)).toBe(800);
  });
  it("is retry-safe: the same key returns the same session and one use", async () => {
    const p = await pkg();
    const k = key();
    const a = await start(p, D.pc1, k);
    expect(await start(p, D.pc1, k)).toBe(a);
    expect(await q(OWNER, "select * from public.list_package_uses($1)", [p])).toHaveLength(1);
  });
  it("enforces eligibility: active, device, category, validity, time of day and usage limit", async () => {
    const off = await pkg({ name: "Off", active: false });
    expect((await err(start(off))).detail).toBe("package_inactive");

    const onlyPc2 = await pkg({ name: "Pc2", dev: D.pc2 });
    expect((await err(start(onlyPc2, D.pc1))).detail).toBe("package_device");
    const vip = await pkg({ name: "Vip", cat: "VIP" });
    expect((await err(start(vip, D.pc1))).detail).toBe("package_device");
    const vipSession = await start(vip, D.pc2);
    await end(vipSession);

    const future = await pkg({ name: "Future", vf: "2999-01-01T00:00:00Z" });
    expect((await err(start(future))).detail).toBe("package_not_valid");
    const expired = await pkg({ name: "Expired", vu: "2000-01-01T00:00:00Z" });
    expect((await err(start(expired))).detail).toBe("package_not_valid");

    // A one-minute daily window that is not "now" in the hall's time zone.
    const minute = n((await db.query<any>("select extract(hour from now())*60 + extract(minute from now()) as m")).rows[0].m);
    const from = (minute + 120) % 1380;
    const never = await pkg({ name: "Never", from, to: from + 10 });
    expect((await err(start(never))).detail).toBe("package_time");

    const once = await pkg({ name: "Once", max: 1 });
    await end(await start(once));
    expect((await err(start(once))).detail).toBe("package_exhausted");
  });
  it("needs session.start and stays inside the hall", async () => {
    const p = await pkg();
    for (const u of [IDS.salesAgent, IDS.ownerH3, IDS.superAdmin, IDS.formerEmployeeH1]) {
      expect((await err(start(p, D.pc1, key(), u))).message).toBe("PERMISSION_DENIED");
    }
    expect((await err(start(p, D.h3pc))).message).toBe("NOT_FOUND");
  });
});

describe("discounts", () => {
  const disc = (over: Partial<{ id: string | null; name: string; kind: string; value: number; vf: string | null; vu: string | null; max: number | null; active: boolean }> = {}, user = OWNER) => {
    const o = { id: null, name: "Ten percent", kind: "percent", value: 1000, vf: null, vu: null, max: null, active: true, ...over };
    return q(user, "select public.upsert_discount($1,$2,$3,$4,$5,$6,$7,$8,$9) as id", [IDS.h1, o.id, o.name, o.kind, o.value, o.vf, o.vu, o.max, o.active]).then((r) => r[0].id as string);
  };
  const apply = (user: string, invoice: string, d: string, reason = "Regular customer", k = key()) =>
    q(user, "select public.apply_discount($1,$2,$3,$4) as id", [invoice, d, reason, k]).then((r) => r[0].id as string);
  const invoice = async (id: string) => (await db.query<any>("select * from public.invoices where id = $1", [id])).rows[0];
  const setLimit = (user: string, limit: number | null) =>
    db.query("update public.hall_memberships set discount_limit_minor = $1 where hall_id = $2 and user_id = $3", [limit, IDS.h1, user]);

  it("owners define discounts; staff can only read the list", async () => {
    expect((await err(disc({}, IDS.employeeH1))).message).toBe("PERMISSION_DENIED");
    expect((await err(disc({}, IDS.ownerH3))).message).toBe("PERMISSION_DENIED");
    await disc();
    expect((await q(IDS.employeeH1, "select * from public.list_discounts($1)", [IDS.h1])).length).toBe(1);
    expect((await err(q(IDS.salesAgent, "select * from public.list_discounts($1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
  });
  it("validates the definition", async () => {
    expect((await err(disc({ name: "" }))).detail).toBe("name");
    expect((await err(disc({ kind: "free" }))).detail).toBe("kind");
    expect((await err(disc({ value: 0 }))).detail).toBe("value");
    expect((await err(disc({ value: 10001 }))).detail).toBe("value"); // over 100%
    expect((await err(disc({ kind: "amount", value: 100_000_001 }))).detail).toBe("value");
    expect((await err(disc({ vf: "2026-02-01T00:00:00Z", vu: "2026-01-01T00:00:00Z" }))).detail).toBe("validity");
    expect((await err(disc({ max: 0 }))).detail).toBe("max_uses");
    await disc();
    expect((await err(disc({ name: "TEN PERCENT" }))).detail).toBe("discount_name_taken");
  });

  it("the owner applies a discount with no limit; the invoice keeps original, discount and final", async () => {
    const inv = await endedInvoice(D.pc1, 60); // 600
    const ten = await disc();
    await apply(OWNER, inv.id, ten);
    expect(n((await invoice(inv.id)).total_minor)).toBe(540);
    const [row] = await q(IDS.employeeH1, "select * from public.list_invoice_discounts($1)", [inv.id]);
    expect([n(row.original_minor), n(row.amount_minor), n(row.final_minor)]).toEqual([600, 60, 540]);
    expect(row.reason).toBe("Regular customer");
    expect((await lines(inv.id)).map((x) => n(x.amount_minor))).toEqual([600, -60]);
    const a = await audit("discount.apply");
    expect(a).toHaveLength(1);
    expect(a[0].before_data.total_minor).toBe(600);
    expect(a[0].after_data.total_minor).toBe(540);
  });
  it("an employee is bounded by their limit and has no authority without one", async () => {
    const inv = await endedInvoice(D.pc1, 60); // 600
    const ten = await disc(); // 60
    const five = await disc({ name: "Fixed 500", kind: "amount", value: 500 });
    expect((await err(apply(IDS.employeeH1, inv.id, ten))).detail).toBe("exceeds_discount_limit"); // no limit set
    await setLimit(IDS.employeeH1, 100);
    await apply(IDS.employeeH1, inv.id, ten); // 60 <= 100
    expect((await err(apply(IDS.employeeH1, inv.id, five))).detail).toBe("exceeds_discount_limit"); // 500 > 100
    expect(n((await invoice(inv.id)).total_minor)).toBe(540);
    await setLimit(IDS.employeeH1, 0);
    expect((await err(apply(IDS.employeeH1, inv.id, ten))).detail).toBe("exceeds_discount_limit");
  });
  it("never exceeds what is still owed, and closes a fully discounted invoice", async () => {
    const inv = await endedInvoice(D.pc1, 60); // 600
    const big = await disc({ name: "Too big", kind: "amount", value: 700 });
    expect((await err(apply(OWNER, inv.id, big))).detail).toBe("exceeds_outstanding");
    const all = await disc({ name: "Free", kind: "percent", value: 10000 });
    await apply(OWNER, inv.id, all);
    const after = await invoice(inv.id);
    expect(n(after.total_minor)).toBe(0);
    expect(after.status).toBe("paid");
    expect((await err(apply(OWNER, inv.id, all, "again"))).detail).toBe("already_paid");
  });
  it("works with partial payments and then lets the rest be paid", async () => {
    const inv = await endedInvoice(D.pc1, 60); // 600
    await q(IDS.employeeH1, "select public.record_cash_payment($1,$2,$3)", [inv.id, 400, key()]);
    const d = await disc({ name: "Fixed 100", kind: "amount", value: 100 });
    await apply(OWNER, inv.id, d);
    const mid = await invoice(inv.id);
    expect([n(mid.total_minor), n(mid.paid_minor), n(mid.outstanding_minor), mid.status]).toEqual([500, 400, 100, "partially_paid"]);
    const exact = await disc({ name: "Fixed 100 b", kind: "amount", value: 100 });
    await apply(OWNER, inv.id, exact);
    expect((await invoice(inv.id)).status).toBe("paid"); // 400 paid of 400
  });
  it("percent discounts are taken from the gross, not compounded", async () => {
    const inv = await endedInvoice(D.pc1, 60); // 600
    const ten = await disc();
    const twenty = await disc({ name: "Twenty", value: 2000 });
    await apply(OWNER, inv.id, ten); // 60 -> 540
    await apply(OWNER, inv.id, twenty); // 20% of gross 600 = 120 -> 420
    expect(n((await invoice(inv.id)).total_minor)).toBe(420);
  });
  it("respects activity, validity and usage limits, and refuses voided invoices", async () => {
    const inv = await endedInvoice(D.pc1, 60);
    const off = await disc({ name: "Off", active: false });
    expect((await err(apply(OWNER, inv.id, off))).detail).toBe("discount_inactive");
    const expired = await disc({ name: "Expired", vu: "2000-01-01T00:00:00Z" });
    expect((await err(apply(OWNER, inv.id, expired))).detail).toBe("discount_not_valid");
    const once = await disc({ name: "Once", kind: "amount", value: 10, max: 1 });
    await apply(OWNER, inv.id, once);
    expect((await err(apply(OWNER, inv.id, once))).detail).toBe("discount_exhausted");

    const other = await endedInvoice(D.pc1, 60);
    await q(OWNER, "select public.void_invoice($1,'mistake')", [other.id]);
    expect((await err(apply(OWNER, other.id, await disc({ name: "Any", kind: "amount", value: 10 })))).detail).toBe("invoice_voided");
  });
  it("validates the reason, is retry-safe and stays inside the hall", async () => {
    const inv = await endedInvoice(D.pc1, 60);
    const ten = await disc();
    expect((await err(apply(OWNER, inv.id, ten, "  "))).detail).toBe("reason");
    const k = key();
    const a = await apply(OWNER, inv.id, ten, "Because", k);
    expect(await apply(OWNER, inv.id, ten, "Because", k)).toBe(a);
    expect(n((await invoice(inv.id)).total_minor)).toBe(540); // applied once
    for (const u of [IDS.salesAgent, IDS.ownerH3, IDS.superAdmin, IDS.formerEmployeeH1]) {
      expect((await err(apply(u, inv.id, ten))).message).toBe("PERMISSION_DENIED");
    }
  });
  it("discount records cannot be edited or deleted, nor written by clients", async () => {
    const inv = await endedInvoice(D.pc1, 60);
    await apply(OWNER, inv.id, await disc());
    await expect(db.exec("update public.invoice_discounts set amount_minor = 1")).rejects.toThrow(/append-only/);
    await expect(db.exec("delete from public.invoice_discounts")).rejects.toThrow(/append-only/);
    expect((await err(q(OWNER, "insert into public.invoice_discounts (hall_id, invoice_id, name, kind, value, original_minor, amount_minor, final_minor, reason) values ($1,$2,'x','amount',1,1,1,0,'x')", [IDS.h1, inv.id]))).message).toMatch(/permission denied/i);
  });
});
