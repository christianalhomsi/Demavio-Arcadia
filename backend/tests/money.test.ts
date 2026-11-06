import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

const D = {
  pc1: "44444444-0000-0000-0000-000000000001", // H1, category Standard (no category rule) -> hall rate 600/h
  pc2: "44444444-0000-0000-0000-000000000002", // H1, category VIP -> 900/h
  console1: "44444444-0000-0000-0000-000000000003", // H1, no category -> hall rate
  h3pc: "44444444-0000-0000-0000-000000000004", // H3 (EUR), no rules -> rate 0
};
const CUSTOMER_EMAIL = "customer.only@example.test";

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
    truncate public.agent_commands cascade;
    truncate public.invoice_counters;
    truncate public.audit_logs;
    truncate public.shifts, public.cash_movements cascade;
    delete from public.pricing_rules where scope = 'device';
    update public.hall_settings set allow_partial_payments = false, payment_methods = array['cash','wallet'],
      billing_increment_minutes = 1, min_billable_minutes = 0;
    update public.pricing_rules set rate_per_hour_minor = 600 where scope = 'hall';
    update public.pricing_rules set rate_per_hour_minor = 900 where scope = 'category';
  `);
  // Cash needs an open shift since migration 0010; the shift tests cover the shift rules themselves.
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
const audit = async (action: string) => (await db.query<any>("select * from public.audit_logs where action = $1", [action])).rows;
const n = (v: unknown) => Number(v);

/** Runs a session of `minutes` on `device` (as the employee), ends it, and returns the invoice. */
async function invoiceFor(device = D.pc1, minutes = 30, over: { customer?: string; hall?: string } = {}) {
  const [{ id }] = await q(IDS.employeeH1, "select public.start_walk_in($1,$2,'open',null,null,'Walk-in',$3) as id", [over.hall ?? IDS.h1, device, key()]);
  await db.exec(`update public.sessions set started_at = now() - interval '${minutes} minutes' where id = '${id}'`);
  if (over.customer) await db.exec(`update public.sessions set customer_id = '${over.customer}' where id = '${id}'`);
  await q(IDS.employeeH1, "select public.end_session($1,'normal',null)", [id]);
  // Since …000048 a wallet must belong to the invoice's player. A walk-in invoice with no player name
  // stays payable from any wallet in the hall, which is what these money tests rely on.
  await db.exec(`update public.invoices set guest_name = null where session_id = '${id}' and customer_id is null`);
  const inv = (await db.query<any>("select * from public.invoices where session_id = $1", [id])).rows[0];
  return { sessionId: id as string, invoiceId: inv.id as string, total: n(inv.total_minor), number: inv.number as string };
}
const payCash = (user: string, invoice: string, amount: number, k = key()) =>
  q(user, "select public.record_cash_payment($1,$2,$3) as id", [invoice, amount, k]).then((r) => r[0].id as string);
const invoiceRow = async (id: string) => (await db.query<any>("select * from public.invoices where id = $1", [id])).rows[0];

async function wallet(email = CUSTOMER_EMAIL, hall = IDS.h1) {
  return (await q(IDS.employeeH1, "select public.open_wallet($1,$2) as id", [hall, email]))[0].id as string;
}
const topUp = (user: string, w: string, amount: number, k = key()) =>
  q(user, "select public.wallet_top_up($1,$2,$3) as id", [w, amount, k]).then((r) => r[0].id as string);
const balance = async (w: string) => n((await db.query<any>("select balance_minor from public.wallets where id = $1", [w])).rows[0].balance_minor);

describe("charge calculation (integer minor units, provisional DEC-05 rules)", () => {
  const charge = async (rate: number, seconds: number, inc = 1, min = 0) =>
    (await db.query<any>("select * from public.compute_session_charge($1,$2,$3,$4)", [rate, seconds, inc, min])).rows[0];

  it("bills elapsed time rounded up to whole minutes", async () => {
    expect(await charge(600, 1500)).toEqual({ billed_minutes: 25, amount_minor: 250 });
    expect(await charge(600, 61)).toEqual({ billed_minutes: 2, amount_minor: 20 });
    expect(await charge(600, 0)).toEqual({ billed_minutes: 0, amount_minor: 0 });
  });
  it("applies increment and minimum billable time", async () => {
    expect((await charge(600, 16 * 60, 15)).billed_minutes).toBe(30);
    expect(await charge(600, 60, 1, 30)).toEqual({ billed_minutes: 30, amount_minor: 300 });
  });
  it("rounds the money UP to the next minor unit and never uses fractions", async () => {
    expect((await charge(100, 60)).amount_minor).toBe(2); // 1.67 -> 2
    expect((await charge(1, 60)).amount_minor).toBe(1); // 0.017 -> 1
    expect((await charge(100000000, 720 * 60)).amount_minor).toBe(1200000000); // large values stay exact
  });
});

describe("pricing rules and snapshots", () => {
  it("picks device > category > hall > none, and records the source", async () => {
    const a = await invoiceFor(D.pc1, 60); // hall rate
    const b = await invoiceFor(D.pc2, 60); // VIP category
    expect([a.total, b.total]).toEqual([600, 900]);
    await db.exec(`insert into public.pricing_rules (hall_id, scope, device_id, rate_per_hour_minor) values ('${IDS.h1}','device','${D.console1}',1200)`);
    expect((await invoiceFor(D.console1, 60)).total).toBe(1200);
    const none = await invoiceFor(D.h3pc, 60, { hall: IDS.h3 }).catch(() => null);
    void none; // H3 employee does not exist; covered below via direct insert
    const sources = (await db.query<any>("select rate_source from public.session_pricing_snapshots order by captured_at")).rows.map((r) => r.rate_source);
    expect(sources).toEqual(["hall", "category", "device"]);
  });
  it("no rule at all means rate 0 and an invoice that owes nothing", async () => {
    const [{ id }] = (await db.query<any>(
      `insert into public.sessions (hall_id, device_id, guest_name, session_type, started_by) values ($1,$2,'Free','open',$3) returning id`,
      [IDS.h3, D.h3pc, IDS.ownerH3])).rows.map((r) => ({ id: r.id }));
    await q(IDS.ownerH3, "select public.end_session($1,'normal',null)", [id]);
    const inv = (await db.query<any>("select * from public.invoices where session_id = $1", [id])).rows[0];
    expect(n(inv.total_minor)).toBe(0);
    expect(inv.status).toBe("paid");
    expect(inv.currency).toBe("EUR");
  });
  it("historical invoices never change when rates change", async () => {
    const inv = await invoiceFor(D.pc1, 60);
    await q(IDS.ownerH1H2, "select public.set_pricing_rate($1,'hall',null,null,5000)", [IDS.h1]);
    expect(n((await invoiceRow(inv.invoiceId)).total_minor)).toBe(600);
    expect((await invoiceFor(D.pc1, 60)).total).toBe(5000); // new sessions use the new rate
    const snap = (await db.query<any>("select rate_per_hour_minor from public.session_pricing_snapshots where session_id = $1", [inv.sessionId])).rows[0];
    expect(n(snap.rate_per_hour_minor)).toBe(600);
  });
  it("snapshots are immutable", async () => {
    const inv = await invoiceFor();
    await expect(db.exec(`update public.session_pricing_snapshots set rate_per_hour_minor = 1 where session_id = '${inv.sessionId}'`)).rejects.toThrow(/append-only/);
    await expect(db.exec(`delete from public.session_pricing_snapshots where session_id = '${inv.sessionId}'`)).rejects.toThrow(/append-only/);
  });
  it("set_pricing_rate upserts, audits before/after, and validates", async () => {
    await q(IDS.ownerH1H2, "select public.set_pricing_rate($1,'category',null,'  vip ',1100)", [IDS.h1]);
    await q(IDS.ownerH1H2, "select public.set_pricing_rate($1,'category',null,'VIP',1300)", [IDS.h1]);
    const rows = (await db.query<any>("select rate_per_hour_minor from public.pricing_rules where scope = 'category'")).rows;
    expect(rows).toHaveLength(1); // 'VIP' and 'vip' are the same category
    const [first, second] = await audit("pricing.rate.set");
    expect(first.before_data.rate_per_hour_minor).toBe(900);
    expect(second.after_data.rate_per_hour_minor).toBe(1300);
    const call = (scope: string, rate: number, dev: string | null = null, cat: string | null = null) =>
      err(q(IDS.ownerH1H2, "select public.set_pricing_rate($1,$2,$3,$4,$5)", [IDS.h1, scope, dev, cat, rate]));
    expect((await call("hall", -1)).detail).toBe("rate");
    expect((await call("hall", 100000001)).detail).toBe("rate");
    expect((await call("weekend", 5)).detail).toBe("scope");
    expect((await call("category", 5)).detail).toBe("category");
    expect((await call("device", 5, D.h3pc)).message).toBe("NOT_FOUND"); // another hall's device
  });
  it("only owners edit pricing; staff cannot even read rate rules", async () => {
    for (const u of [IDS.employeeH1, IDS.ownerH3, IDS.salesAgent, IDS.superAdmin]) {
      expect((await err(q(u, "select public.set_pricing_rate($1,'hall',null,null,1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
    }
    expect(await q(IDS.employeeH1, "select * from public.pricing_rules")).toEqual([]);
    expect((await q(IDS.ownerH1H2, "select * from public.list_pricing($1)", [IDS.h1])).length).toBe(2);
    expect((await err(q(IDS.employeeH1, "select * from public.list_pricing($1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
  });
  it("billing rules and rule deletion are validated and audited", async () => {
    await q(IDS.ownerH1H2, "select public.update_billing_rules($1, 15, 30)", [IDS.h1]);
    expect((await invoiceFor(D.pc1, 5)).total).toBe(300); // 5 min -> min 30 min -> 300
    expect((await err(q(IDS.ownerH1H2, "select public.update_billing_rules($1, 0, 0)", [IDS.h1]))).message).toBe("VALIDATION");
    const [{ id }] = await q(IDS.ownerH1H2, "select id from public.list_pricing($1) where scope = 'category'", [IDS.h1]);
    await q(IDS.ownerH1H2, "select public.delete_pricing_rate($1)", [id]);
    expect((await audit("pricing.rate.delete")).length).toBe(1);
  });
});

describe("invoice creation", () => {
  it("ending a session creates exactly one OPEN invoice with sequential numbers and an item", async () => {
    const a = await invoiceFor(D.pc1, 30);
    const b = await invoiceFor(D.pc2, 30);
    expect([a.number, b.number]).toEqual(["INV-000001", "INV-000002"]);
    const inv = await invoiceRow(a.invoiceId);
    expect(inv).toMatchObject({ status: "open", currency: "USD" });
    expect(n(inv.billed_minutes)).toBe(30);
    expect(n(inv.outstanding_minor)).toBe(300);
    const items = (await db.query<any>("select amount_minor, detail from public.invoice_items where invoice_id = $1", [a.invoiceId])).rows;
    expect(items).toHaveLength(1);
    expect(n(items[0].amount_minor)).toBe(300);
    expect((await audit("invoice.create")).length).toBe(2);
  });
  it("retrying the end or finalizing again never creates a second invoice", async () => {
    const a = await invoiceFor();
    await q(IDS.employeeH1, "select public.end_session($1,'normal',null)", [a.sessionId]);
    expect((await db.query<any>("select count(*)::int c from public.invoices")).rows[0].c).toBe(1);
    const again = await db.query<any>("select public.finalize_session_invoice($1) as id", [a.sessionId]);
    expect(again.rows[0].id).toBe(a.invoiceId);
  });
  it("is readable by invoice.view holders only; clients cannot write invoices", async () => {
    const a = await invoiceFor();
    expect((await q(IDS.employeeH1, "select * from public.invoices")).length).toBe(1);
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.superAdmin, IDS.customerOnly]) {
      expect(await q(u, "select * from public.invoices")).toEqual([]);
      expect(await q(u, "select * from public.invoice_items")).toEqual([]);
      expect((await err(q(u, "select * from public.list_invoices($1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
    }
    await expect(q(IDS.ownerH1H2, "update public.invoices set total_minor = 1 where id = $1", [a.invoiceId])).rejects.toThrow(/permission denied/i);
    await expect(q(IDS.ownerH1H2, "select * from public.invoice_counters")).rejects.toThrow(/permission denied/i);
  });
  it("list_invoices filters by status and outstanding and pages", async () => {
    const a = await invoiceFor(D.pc1, 30);
    await invoiceFor(D.pc2, 30);
    await payCash(IDS.employeeH1, a.invoiceId, 300);
    expect((await q(IDS.employeeH1, "select * from public.list_invoices($1, null, true)", [IDS.h1])).length).toBe(1);
    expect((await q(IDS.employeeH1, "select * from public.list_invoices($1, 'paid')", [IDS.h1])).length).toBe(1);
    const page = await q(IDS.employeeH1, "select * from public.list_invoices($1, null, false, 1, 0)", [IDS.h1]);
    expect(page).toHaveLength(1);
    expect(n(page[0].total)).toBe(2);
    expect(page[0].device_name).toBeTruthy();
  });
});

describe("cash payments", () => {
  it("full payment marks the invoice paid and records who collected it", async () => {
    const a = await invoiceFor();
    const pid = await payCash(IDS.employeeH1, a.invoiceId, a.total);
    const inv = await invoiceRow(a.invoiceId);
    expect(inv.status).toBe("paid");
    expect(n(inv.paid_minor)).toBe(300);
    expect(n(inv.outstanding_minor)).toBe(0);
    const p = (await db.query<any>("select * from public.payments where id = $1", [pid])).rows[0];
    expect(p).toMatchObject({ method: "cash", created_by: IDS.employeeH1, status: "succeeded" });
    expect((await audit("payment.record")).length).toBe(1);
  });
  it("is idempotent: a retry returns the same payment and never charges twice", async () => {
    const a = await invoiceFor();
    const k = key();
    const p1 = await payCash(IDS.employeeH1, a.invoiceId, a.total, k);
    const p2 = await payCash(IDS.employeeH1, a.invoiceId, a.total, k);
    expect(p2).toBe(p1);
    expect((await db.query<any>("select count(*)::int c from public.payments")).rows[0].c).toBe(1);
    expect((await err(payCash(IDS.employeeH1, a.invoiceId, a.total - 1, k))).detail).toBe("idempotency_mismatch");
  });
  it("cannot overpay, pay twice, or pay a voided invoice", async () => {
    const a = await invoiceFor();
    expect((await err(payCash(IDS.employeeH1, a.invoiceId, a.total + 1))).detail).toBe("exceeds_outstanding");
    await payCash(IDS.employeeH1, a.invoiceId, a.total);
    expect((await err(payCash(IDS.employeeH1, a.invoiceId, 1))).detail).toBe("already_paid");
    const b = await invoiceFor(D.pc2, 30);
    await q(IDS.ownerH1H2, "select public.void_invoice($1,'Entered by mistake')", [b.invoiceId]);
    expect((await err(payCash(IDS.employeeH1, b.invoiceId, 1))).detail).toBe("invoice_voided");
  });
  it("partial payments only when the hall allows them", async () => {
    const a = await invoiceFor();
    expect((await err(payCash(IDS.employeeH1, a.invoiceId, 100))).detail).toBe("partial_not_allowed");
    await db.exec("update public.hall_settings set allow_partial_payments = true");
    await payCash(IDS.employeeH1, a.invoiceId, 100);
    expect((await invoiceRow(a.invoiceId)).status).toBe("partially_paid");
    await payCash(IDS.employeeH1, a.invoiceId, 200);
    const inv = await invoiceRow(a.invoiceId);
    expect([inv.status, n(inv.paid_minor)]).toEqual(["paid", 300]);
  });
  it("validates amounts and respects enabled methods", async () => {
    const a = await invoiceFor();
    for (const amount of [0, -5]) expect((await err(payCash(IDS.employeeH1, a.invoiceId, amount))).detail).toBe("amount");
    await db.exec("update public.hall_settings set payment_methods = array['wallet']");
    expect((await err(payCash(IDS.employeeH1, a.invoiceId, a.total))).detail).toBe("method_disabled");
  });
  it("is refused to other tenants, sales and customers; payments are immutable", async () => {
    const a = await invoiceFor();
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.superAdmin, IDS.customerOnly, IDS.deactivated]) {
      expect((await err(payCash(u, a.invoiceId, a.total))).message).toBe("PERMISSION_DENIED");
    }
    const pid = await payCash(IDS.employeeH1, a.invoiceId, a.total);
    await expect(db.exec(`update public.payments set amount_minor = 1 where id = '${pid}'`)).rejects.toThrow(/append-only/);
    await expect(db.exec(`delete from public.payments where id = '${pid}'`)).rejects.toThrow(/append-only/);
    await expect(q(IDS.ownerH1H2, "insert into public.payments (hall_id, invoice_id, method, amount_minor, currency) values ($1,$2,'cash',1,'USD')", [IDS.h1, a.invoiceId])).rejects.toThrow(/permission denied/i);
  });
});

describe("void_invoice", () => {
  it("owners void unpaid invoices with a reason; retry-safe; outstanding becomes 0", async () => {
    const a = await invoiceFor();
    expect((await err(q(IDS.employeeH1, "select public.void_invoice($1,'x')", [a.invoiceId]))).message).toBe("PERMISSION_DENIED");
    expect((await err(q(IDS.ownerH1H2, "select public.void_invoice($1,' ')", [a.invoiceId]))).detail).toBe("reason");
    await q(IDS.ownerH1H2, "select public.void_invoice($1,'Test session')", [a.invoiceId]);
    await q(IDS.ownerH1H2, "select public.void_invoice($1,'again')", [a.invoiceId]);
    const inv = await invoiceRow(a.invoiceId);
    expect([inv.status, n(inv.outstanding_minor), inv.void_reason]).toEqual(["voided", 0, "Test session"]);
    expect((await audit("invoice.void")).length).toBe(1);
  });
  it("cannot void an invoice that has payments", async () => {
    const a = await invoiceFor();
    await payCash(IDS.employeeH1, a.invoiceId, a.total);
    expect((await err(q(IDS.ownerH1H2, "select public.void_invoice($1,'oops')", [a.invoiceId]))).detail).toBe("has_payments");
  });
});

describe("wallets and ledger", () => {
  it("opens one wallet per customer per hall in the hall's currency; unknown emails look the same as missing", async () => {
    const w1 = await wallet();
    expect(await wallet()).toBe(w1);
    expect((await db.query<any>("select currency, balance_minor from public.wallets where id = $1", [w1])).rows[0]).toMatchObject({ currency: "USD" });
    expect((await err(q(IDS.employeeH1, "select public.open_wallet($1,'nobody@example.test')", [IDS.h1]))).message).toBe("NOT_FOUND");
    expect((await err(q(IDS.ownerH3, "select public.open_wallet($1,$2)", [IDS.h1, CUSTOMER_EMAIL]))).message).toBe("PERMISSION_DENIED");
    expect((await audit("wallet.open")).length).toBe(1);
  });
  it("wallets are isolated per hall", async () => {
    const w1 = await wallet();
    const w3 = (await q(IDS.ownerH3, "select public.open_wallet($1,$2) as id", [IDS.h3, CUSTOMER_EMAIL]))[0].id;
    expect(w3).not.toBe(w1);
    expect((await db.query<any>("select currency from public.wallets where id = $1", [w3])).rows[0].currency).toBe("EUR");
    expect((await q(IDS.ownerH3, "select * from public.wallets")).map((w) => w.id)).toEqual([w3]);
    expect((await q(IDS.employeeH1, "select * from public.wallets")).map((w) => w.id)).toEqual([w1]);
  });
  it("top-up credits the balance, writes a ledger row, and is idempotent", async () => {
    const w = await wallet();
    const k = key();
    const t1 = await topUp(IDS.employeeH1, w, 2500, k);
    expect(await topUp(IDS.employeeH1, w, 2500, k)).toBe(t1);
    expect(await balance(w)).toBe(2500);
    const ledger = await q(IDS.employeeH1, "select * from public.list_wallet_ledger($1)", [w]);
    expect(ledger).toHaveLength(1);
    expect([ledger[0].kind, n(ledger[0].amount_minor), n(ledger[0].balance_after_minor)]).toEqual(["top_up", 2500, 2500]);
    expect((await err(topUp(IDS.employeeH1, w, 100, k))).detail).toBe("idempotency_mismatch");
    expect((await audit("wallet.top_up")).length).toBe(1);
  });
  it("validates top-ups and refuses frozen wallets, disabled cash and outsiders", async () => {
    const w = await wallet();
    for (const amount of [0, -1, 100000001]) expect((await err(topUp(IDS.employeeH1, w, amount))).detail).toBe("amount");
    await db.exec(`update public.wallets set status = 'frozen' where id = '${w}'`);
    expect((await err(topUp(IDS.employeeH1, w, 100))).detail).toBe("wallet_frozen");
    await db.exec(`update public.wallets set status = 'active' where id = '${w}'`);
    await db.exec("update public.hall_settings set payment_methods = array['wallet']");
    expect((await err(topUp(IDS.employeeH1, w, 100))).detail).toBe("method_disabled");
    await db.exec("update public.hall_settings set payment_methods = array['cash','wallet']");
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.customerOnly]) {
      expect((await err(topUp(u, w, 100))).message).toBe("PERMISSION_DENIED");
    }
  });
  it("the ledger is append-only and clients cannot touch balances", async () => {
    const w = await wallet();
    const t = await topUp(IDS.employeeH1, w, 500);
    await expect(db.exec(`update public.wallet_transactions set amount_minor = 999 where id = '${t}'`)).rejects.toThrow(/append-only/);
    await expect(db.exec(`delete from public.wallet_transactions where id = '${t}'`)).rejects.toThrow(/append-only/);
    await expect(q(IDS.ownerH1H2, "update public.wallets set balance_minor = 99999 where id = $1", [w])).rejects.toThrow(/permission denied/i);
    await expect(db.exec(`update public.wallets set balance_minor = -1 where id = '${w}'`)).rejects.toThrow(/balance_minor/);
  });
  it("wallet listing hides other halls and supports search", async () => {
    await wallet();
    expect((await q(IDS.employeeH1, "select * from public.list_wallets($1, 'customer')", [IDS.h1])).length).toBe(1);
    expect(await q(IDS.employeeH1, "select * from public.list_wallets($1, 'zzz')", [IDS.h1])).toEqual([]);
    expect((await err(q(IDS.ownerH3, "select * from public.list_wallets($1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
  });
});

describe("paying from a wallet", () => {
  const payWallet = (user: string, inv: string, w: string, amount: number, k = key()) =>
    q(user, "select public.pay_invoice_from_wallet($1,$2,$3,$4) as id", [inv, w, amount, k]).then((r) => r[0].id as string);

  it("debits the wallet, writes the ledger, and settles the invoice", async () => {
    const w = await wallet();
    await topUp(IDS.employeeH1, w, 1000);
    const a = await invoiceFor(D.pc1, 30);
    const pid = await payWallet(IDS.employeeH1, a.invoiceId, w, a.total);
    expect(await balance(w)).toBe(700);
    expect((await invoiceRow(a.invoiceId)).status).toBe("paid");
    const ledger = (await db.query<any>("select kind, amount_minor, balance_after_minor, payment_id from public.wallet_transactions order by created_at, id")).rows;
    expect(ledger.map((l) => [l.kind, n(l.amount_minor), n(l.balance_after_minor)])).toEqual([["top_up", 1000, 1000], ["payment", -300, 700]]);
    expect(ledger[1].payment_id).toBe(pid);
  });
  it("is idempotent and never debits twice", async () => {
    const w = await wallet();
    await topUp(IDS.employeeH1, w, 1000);
    const a = await invoiceFor(D.pc1, 30);
    const k = key();
    const p1 = await payWallet(IDS.employeeH1, a.invoiceId, w, a.total, k);
    expect(await payWallet(IDS.employeeH1, a.invoiceId, w, a.total, k)).toBe(p1);
    expect(await balance(w)).toBe(700);
  });
  it("refuses insufficient funds and never goes negative", async () => {
    const w = await wallet();
    await topUp(IDS.employeeH1, w, 100);
    const a = await invoiceFor(D.pc1, 30);
    expect((await err(payWallet(IDS.employeeH1, a.invoiceId, w, a.total))).message).toBe("INSUFFICIENT_FUNDS");
    expect(await balance(w)).toBe(100);
    expect((await invoiceRow(a.invoiceId)).status).toBe("open");
    await db.exec("update public.hall_settings set allow_partial_payments = true");
    await payWallet(IDS.employeeH1, a.invoiceId, w, 100);
    expect(await balance(w)).toBe(0);
    expect((await err(payWallet(IDS.employeeH1, a.invoiceId, w, 100))).message).toBe("INSUFFICIENT_FUNDS");
  });
  it("the wallet must belong to the customer on the invoice; walk-in invoices may use any wallet in the hall", async () => {
    const w = await wallet();
    await topUp(IDS.employeeH1, w, 5000);
    const walkIn = await invoiceFor(D.pc1, 30);
    await payWallet(IDS.employeeH1, walkIn.invoiceId, w, walkIn.total); // guest invoice: allowed
    const other = IDS.ownerH1H2; // a different customer on the invoice
    const forOther = await invoiceFor(D.pc2, 30, { customer: other });
    expect((await err(payWallet(IDS.employeeH1, forOther.invoiceId, w, forOther.total))).detail).toBe("wrong_customer");
    const own = await invoiceFor(D.console1, 30, { customer: IDS.customerOnly });
    await payWallet(IDS.employeeH1, own.invoiceId, w, own.total);
  });
  it("rejects wallets from another hall, frozen wallets, disabled method and currency mismatch", async () => {
    const w = await wallet();
    await topUp(IDS.employeeH1, w, 5000);
    const a = await invoiceFor(D.pc1, 30);
    const w3 = (await q(IDS.ownerH3, "select public.open_wallet($1,$2) as id", [IDS.h3, CUSTOMER_EMAIL]))[0].id;
    expect((await err(payWallet(IDS.employeeH1, a.invoiceId, w3, a.total))).message).toBe("NOT_FOUND");
    await db.exec(`update public.wallets set status = 'frozen' where id = '${w}'`);
    expect((await err(payWallet(IDS.employeeH1, a.invoiceId, w, a.total))).detail).toBe("wallet_frozen");
    await db.exec(`update public.wallets set status = 'active', currency = 'EUR' where id = '${w}'`);
    expect((await err(payWallet(IDS.employeeH1, a.invoiceId, w, a.total))).detail).toBe("currency_mismatch");
    await db.exec(`update public.wallets set currency = 'USD' where id = '${w}'`);
    await db.exec("update public.hall_settings set payment_methods = array['cash']");
    expect((await err(payWallet(IDS.employeeH1, a.invoiceId, w, a.total))).detail).toBe("method_disabled");
    expect(await balance(w)).toBe(5000);
  });
  it("is refused to outsiders", async () => {
    const w = await wallet();
    await topUp(IDS.employeeH1, w, 5000);
    const a = await invoiceFor(D.pc1, 30);
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.customerOnly]) {
      expect((await err(payWallet(u, a.invoiceId, w, a.total))).message).toBe("PERMISSION_DENIED");
    }
  });
  it("many sequential debits can never overdraw the wallet", async () => {
    const w = await wallet();
    await topUp(IDS.employeeH1, w, 700);
    await db.exec("update public.hall_settings set allow_partial_payments = true");
    let ok = 0;
    for (let i = 0; i < 4; i++) {
      const inv = await invoiceFor(i % 2 ? D.pc1 : D.console1, 30); // 300 each
      const r = await err(payWallet(IDS.employeeH1, inv.invoiceId, w, inv.total));
      if (r.message === "NO_ERROR") ok++;
    }
    expect(ok).toBe(2);
    expect(await balance(w)).toBe(100);
    const sum = n((await db.query<any>("select sum(amount_minor) s from public.wallet_transactions where wallet_id = $1", [w])).rows[0].s);
    expect(sum).toBe(await balance(w)); // ledger and balance agree
  });
});

describe("refunds", () => {
  const request = (user: string, payment: string, amount: number, code = "customer_request", note: string | null = null, k = key()) =>
    q(user, "select public.request_refund($1,$2,$3,$4,$5) as id", [payment, amount, code, note, k]).then((r) => r[0].id as string);
  const decide = (user: string, refund: string, approve: boolean, note: string | null = null) =>
    q(user, "select public.decide_refund($1,$2,$3)", [refund, approve, note]);

  async function paidByWallet(amountTopUp = 1000) {
    const w = await wallet();
    await topUp(IDS.employeeH1, w, amountTopUp);
    const inv = await invoiceFor(D.pc1, 30);
    const [{ id }] = await q(IDS.employeeH1, "select public.pay_invoice_from_wallet($1,$2,$3,$4) as id", [inv.invoiceId, w, inv.total, key()]);
    return { w, inv, pid: id as string };
  }

  it("an employee requests, an owner approves, and a wallet payment is credited back", async () => {
    const { w, inv, pid } = await paidByWallet();
    const r = await request(IDS.employeeH1, pid, 100, "overcharge");
    expect((await q(IDS.employeeH1, "select * from public.list_refunds($1)", [IDS.h1]))[0]).toMatchObject({ status: "pending", method: "wallet" });
    await decide(IDS.ownerH1H2, r, true, "Approved");
    expect(await balance(w)).toBe(800); // 700 + 100
    expect(n((await invoiceRow(inv.invoiceId)).refunded_minor)).toBe(100);
    const refundTx = (await db.query<any>("select kind, amount_minor from public.wallet_transactions where refund_id = $1", [r])).rows;
    expect(refundTx.map((t) => [t.kind, n(t.amount_minor)])).toEqual([["refund", 100]]);
    expect((await audit("refund.approve")).length).toBe(1);
  });
  it("cash refunds are approved without touching any wallet", async () => {
    const a = await invoiceFor(D.pc1, 30);
    const pid = await payCash(IDS.employeeH1, a.invoiceId, a.total);
    const r = await request(IDS.employeeH1, pid, 300, "service_issue");
    await decide(IDS.ownerH1H2, r, true);
    expect(n((await invoiceRow(a.invoiceId)).refunded_minor)).toBe(300);
    expect((await db.query<any>("select count(*)::int c from public.wallet_transactions")).rows[0].c).toBe(0);
  });
  it("employees cannot approve, and nobody approves their own request", async () => {
    const { pid } = await paidByWallet();
    const r = await request(IDS.employeeH1, pid, 50);
    expect((await err(decide(IDS.employeeH1, r, true))).message).toBe("PERMISSION_DENIED");
    const own = await request(IDS.ownerH1H2, pid, 50);
    expect((await err(decide(IDS.ownerH1H2, own, true))).detail).toBe("self_approval");
    await decide(IDS.ownerH1H2, r, true); // someone else's request is fine
  });
  it("cannot refund more than was paid, across pending and approved refunds together", async () => {
    const { pid } = await paidByWallet(); // payment of 300
    await request(IDS.employeeH1, pid, 200);
    expect((await err(request(IDS.employeeH1, pid, 101))).detail).toBe("exceeds_refundable");
    await request(IDS.employeeH1, pid, 100);
    expect((await err(request(IDS.employeeH1, pid, 1))).detail).toBe("exceeds_refundable");
  });
  it("rejection refunds nothing; decisions are retry-safe and cannot be flipped", async () => {
    const { w, pid } = await paidByWallet();
    const r = await request(IDS.employeeH1, pid, 100);
    await decide(IDS.ownerH1H2, r, false, "Not eligible");
    await decide(IDS.ownerH1H2, r, false);
    expect(await balance(w)).toBe(700);
    expect((await err(decide(IDS.ownerH1H2, r, true))).detail).toBe("already_decided");
    const r2 = await request(IDS.employeeH1, pid, 100);
    await decide(IDS.ownerH1H2, r2, true);
    await decide(IDS.ownerH1H2, r2, true);
    expect(await balance(w)).toBe(800); // credited once
  });
  it("is idempotent per key, validates input and requires a note for 'other'", async () => {
    const { pid } = await paidByWallet();
    const k = key();
    const a = await request(IDS.employeeH1, pid, 50, "overcharge", null, k);
    expect(await request(IDS.employeeH1, pid, 50, "overcharge", null, k)).toBe(a);
    expect((await err(request(IDS.employeeH1, pid, 60, "overcharge", null, k))).detail).toBe("idempotency_mismatch");
    expect((await err(request(IDS.employeeH1, pid, 10, "other", " "))).detail).toBe("note");
    expect((await err(request(IDS.employeeH1, pid, 10, "because"))).detail).toBe("reason_code");
    expect((await err(request(IDS.employeeH1, pid, 0))).detail).toBe("amount");
  });
  it("is refused to other tenants, sales and customers", async () => {
    const { pid } = await paidByWallet();
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.customerOnly]) {
      expect((await err(request(u, pid, 10))).message).toBe("PERMISSION_DENIED");
      expect(await q(u, "select * from public.refunds")).toEqual([]);
    }
    const r = await request(IDS.employeeH1, pid, 10);
    expect((await err(decide(IDS.ownerH3, r, true))).message).toBe("PERMISSION_DENIED");
  });
});
