import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

const D = {
  pc1: "44444444-0000-0000-0000-000000000001",
  pc2: "44444444-0000-0000-0000-000000000002",
};
const OWNER = IDS.ownerH1H2;

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
    truncate public.expenses, public.products, public.discounts cascade;
    truncate public.agent_commands cascade;
    truncate public.invoice_counters;
    truncate public.audit_logs;
    truncate public.shifts, public.cash_movements cascade;
    update public.hall_settings set allow_partial_payments = true, payment_methods = array['cash','wallet'],
      billing_increment_minutes = 1, min_billable_minutes = 0;
    update public.pricing_rules set rate_per_hour_minor = 600 where scope = 'hall';
    update public.pricing_rules set rate_per_hour_minor = 900 where scope = 'category';
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
const today = () => new Date().toISOString().slice(0, 10);

const expense = (user: string, over: Partial<{ hall: string; cat: string; amount: number; on: string; paid: string; desc: string | null; k: string }> = {}) => {
  const o = { hall: IDS.h1, cat: "rent", amount: 5000, on: today(), paid: "bank", desc: "March rent", k: key(), ...over };
  return q(user, "select public.create_expense($1,$2,$3,$4,$5,$6,$7) as id", [o.hall, o.cat, o.amount, o.on, o.paid, o.desc, o.k]).then((r) => r[0].id as string);
};

describe("expenses", () => {
  it("are owner-only and hall-scoped", async () => {
    for (const u of [IDS.employeeH1, IDS.ownerH3, IDS.salesAgent, IDS.superAdmin, IDS.formerEmployeeH1]) {
      expect((await err(expense(u))).message).toBe("PERMISSION_DENIED");
      expect((await err(q(u, "select * from public.list_expenses($1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
    }
    const id = await expense(OWNER);
    expect(await q(IDS.employeeH1, "select * from public.expenses")).toEqual([]);
    expect(await q(IDS.ownerH3, "select * from public.expenses")).toEqual([]);
    expect((await q(OWNER, "select * from public.expenses where id = $1", [id])).length).toBe(1);
  });
  it("validates every field", async () => {
    expect((await err(expense(OWNER, { cat: "party" }))).detail).toBe("category");
    expect((await err(expense(OWNER, { amount: 0 }))).detail).toBe("amount");
    expect((await err(expense(OWNER, { on: "2999-01-01" }))).detail).toBe("spent_on");
    expect((await err(expense(OWNER, { paid: "crypto" }))).detail).toBe("paid_with");
    expect((await err(expense(OWNER, { desc: "x".repeat(301) }))).detail).toBe("description");
  });
  it("is retry-safe and records the hall currency", async () => {
    const k = key();
    const a = await expense(OWNER, { k });
    expect(await expense(OWNER, { k })).toBe(a);
    expect((await err(expense(OWNER, { k, amount: 1 }))).detail).toBe("idempotency_mismatch");
    const [row] = await q(OWNER, "select * from public.list_expenses($1)", [IDS.h1]);
    expect(row.currency).toBe("USD");
    expect(n(row.total)).toBe(1);
  });
  it("can be corrected (audited) and voided with a reason, never deleted", async () => {
    const id = await expense(OWNER);
    await q(OWNER, "select public.update_expense($1,'electricity',7000,$2,'cash','Bill')", [id, today()]);
    const [u] = await audit("expense.update");
    expect(u.before_data.amount_minor).toBe(5000);
    expect(u.after_data.amount_minor).toBe(7000);
    expect((await err(q(OWNER, "select public.void_expense($1,'x')", [id]))).detail).toBe("reason");
    await q(OWNER, "select public.void_expense($1,'Entered twice')", [id]);
    await q(OWNER, "select public.void_expense($1,'Entered twice')", [id]); // retry-safe
    expect((await audit("expense.void")).length).toBe(1);
    expect((await err(q(OWNER, "select public.update_expense($1,'rent',1,$2,'cash',null)", [id, today()]))).detail).toBe("expense_voided");
    const rows = await q(OWNER, "select * from public.list_expenses($1)", [IDS.h1]);
    expect(rows[0].status).toBe("voided");
    expect(n(rows[0].total_amount_minor)).toBe(0); // voided expenses are not counted
    expect((await err(q(OWNER, "delete from public.expenses"))).message).toMatch(/permission denied/i);
  });
  it("filters by date and category and totals only recorded expenses", async () => {
    await expense(OWNER, { cat: "rent", amount: 1000, on: "2026-01-10" });
    await expense(OWNER, { cat: "supplies", amount: 250, on: "2026-01-20" });
    await expense(OWNER, { cat: "supplies", amount: 400, on: today() });
    const jan = await q(OWNER, "select * from public.list_expenses($1,'2026-01-01','2026-01-31')", [IDS.h1]);
    expect(jan).toHaveLength(2);
    expect(n(jan[0].total_amount_minor)).toBe(1250);
    const sup = await q(OWNER, "select * from public.list_expenses($1,null,null,'supplies')", [IDS.h1]);
    expect(sup).toHaveLength(2);
  });
  it("only accepts a receipt path inside the expense's own folder", async () => {
    const id = await expense(OWNER);
    const ok = `${IDS.h1}/${id}/receipt.pdf`;
    await q(OWNER, "select public.attach_expense_receipt($1,$2)", [id, ok]);
    expect(await q(OWNER, "select public.get_expense_receipt_path($1) as p", [id])).toEqual([{ p: ok }]);
    for (const bad of [`${IDS.h2}/${id}/r.pdf`, `${IDS.h1}/${key()}/r.pdf`, `${IDS.h1}/${id}/../x.pdf`, `${IDS.h1}/${id}/a/b.pdf`, "", `${IDS.h1}/${id}/`]) {
      expect((await err(q(OWNER, "select public.attach_expense_receipt($1,$2)", [id, bad]))).detail).toBe("receipt");
    }
    expect((await err(q(IDS.employeeH1, "select public.get_expense_receipt_path($1)", [id]))).message).toBe("PERMISSION_DENIED");
    expect((await err(q(IDS.employeeH1, "select public.attach_expense_receipt($1,$2)", [id, ok]))).message).toBe("PERMISSION_DENIED");
    expect((await q(OWNER, "select has_receipt from public.list_expenses($1)", [IDS.h1]))[0].has_receipt).toBe(true);
  });
});

describe("report breakdown", () => {
  async function sold(device: string, minutes: number) {
    const [{ id }] = await q(IDS.employeeH1, "select public.start_walk_in($1,$2,'open',null,null,'Walk-in',$3) as id", [IDS.h1, device, key()]);
    await db.exec(`update public.sessions set started_at = now() - interval '${minutes} minutes' where id = '${id}'`);
    await q(IDS.employeeH1, "select public.end_session($1,'normal',null)", [id]);
    return (await db.query<any>("select * from public.invoices where session_id = $1", [id])).rows[0];
  }
  const breakdown = (user = OWNER) =>
    q(user, "select * from public.report_breakdown($1, now() - interval '1 day', now() + interval '1 day')", [IDS.h1]);
  const pick = (rows: any[], dimension: string) => rows.filter((r) => r.dimension === dimension);

  it("splits billed amounts by device, category, day and employee collections", async () => {
    const a = await sold(D.pc1, 60); // 600 (hall rate)
    const b = await sold(D.pc2, 60); // 900 (VIP)
    await q(IDS.employeeH1, "select public.record_cash_payment($1,600,$2)", [a.id, key()]);
    const rows = await breakdown();

    const byDevice = Object.fromEntries(pick(rows, "device").map((r) => [r.label, n(r.amount_minor)]));
    expect(Object.values(byDevice).sort()).toEqual([600, 900]);
    const cats = pick(rows, "device_category").reduce((s, r) => s + n(r.amount_minor), 0);
    expect(cats).toBe(1500);
    const days = pick(rows, "day");
    expect(days).toHaveLength(1);
    expect(n(days[0].amount_minor)).toBe(1500);
    expect(n(days[0].item_count)).toBe(2);
    const emp = pick(rows, "employee");
    expect(emp).toHaveLength(1);
    expect(n(emp[0].amount_minor)).toBe(600);
    expect(b.id).toBeTruthy();
  });
  it("reports expenses, discounts and write-offs as separate totals", async () => {
    const inv = await sold(D.pc1, 60); // 600
    const [{ id: disc }] = await q(OWNER, "select public.upsert_discount($1,null,'Ten','percent',1000,null,null,null,true) as id", [IDS.h1]);
    await q(OWNER, "select public.apply_discount($1,$2,'Regular',$3)", [inv.id, disc, key()]); // 60
    await q(OWNER, "select public.write_off_invoice($1,100,'Gap',$2)", [inv.id, key()]);
    await expense(OWNER, { cat: "rent", amount: 1000 });
    await expense(OWNER, { cat: "supplies", amount: 250 });
    const gone = await expense(OWNER, { cat: "other", amount: 999 });
    await q(OWNER, "select public.void_expense($1,'Mistake')", [gone]);

    const rows = await breakdown();
    const total = (k: string) => n(pick(rows, "total").find((r) => r.key === k)?.amount_minor);
    expect(total("expenses")).toBe(1250);
    expect(total("discounts")).toBe(60);
    expect(total("write_offs")).toBe(100);
    expect(pick(rows, "expense_category").map((r) => [r.key, n(r.amount_minor)]).sort()).toEqual([["rent", 1000], ["supplies", 250]]);
    const de = pick(rows, "discount_employee");
    expect(de).toHaveLength(1);
    expect(n(de[0].amount_minor)).toBe(60);
  });
  it("lists product sales by name", async () => {
    const [{ id: prod }] = await q(OWNER, "select public.upsert_product($1,null,'Cola',150,true) as id", [IDS.h1]);
    const [{ id: s }] = await q(IDS.employeeH1, "select public.start_walk_in($1,$2,'open',null,null,'Walk-in',$3) as id", [IDS.h1, D.pc1, key()]);
    await q(IDS.employeeH1, "select public.add_session_item($1,$2,3,$3)", [s, prod, key()]);
    await q(IDS.employeeH1, "select public.end_session($1,'normal',null)", [s]);
    const rows = pick(await breakdown(), "product");
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Cola");
    expect(n(rows[0].item_count)).toBe(3);
    expect(n(rows[0].amount_minor)).toBe(450);
  });
  it("needs the financial report permission, a sane period, and stays inside the hall", async () => {
    for (const u of [IDS.employeeH1, IDS.ownerH3, IDS.salesAgent, IDS.superAdmin]) {
      expect((await err(breakdown(u))).message).toBe("PERMISSION_DENIED");
    }
    expect((await err(q(OWNER, "select * from public.report_breakdown($1, now(), now() - interval '1 day')", [IDS.h1]))).detail).toBe("period");
    expect((await err(q(OWNER, "select * from public.report_breakdown($1, now() - interval '400 days', now())", [IDS.h1]))).detail).toBe("period");
  });
});
