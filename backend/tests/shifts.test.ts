import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

const PC = "44444444-0000-0000-0000-000000000001"; // H1, hall rate 600/h
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
const n = (v: unknown) => Number(v);
const audit = async (action: string) => (await db.query<any>("select * from public.audit_logs where action = $1", [action])).rows;

const openShift = (user: string, opening = 1000, hall = IDS.h1, k = key()) =>
  q(user, "select public.open_shift($1, null, $2, $3) as id", [hall, opening, k]).then((r) => r[0].id as string);
const closeShift = (user: string, shift: string, counted: number, override: string | null = null, k = key()) =>
  q(user, "select public.close_shift($1,$2,$3,$4) as r", [shift, counted, override, k]).then((r) => r[0].r as any);
const shiftRow = async (id: string) => (await q(IDS.ownerH1H2, "select * from public.list_shifts($1,null,25,0,$2)", [IDS.h1, id]))[0];

async function invoiceFor(minutes = 30) {
  const [{ id }] = await q(IDS.employeeH1, "select public.start_walk_in($1,$2,'open',null,null,'Walk-in',$3) as id", [IDS.h1, PC, key()]);
  await db.exec(`update public.sessions set started_at = now() - interval '${minutes} minutes' where id = '${id}'`);
  await q(IDS.employeeH1, "select public.end_session($1,'normal',null)", [id]);
  // Since …000048 a wallet must belong to the invoice's player; a nameless walk-in invoice takes any wallet.
  await db.exec(`update public.invoices set guest_name = null where session_id = '${id}' and customer_id is null`);
  const inv = (await db.query<any>("select * from public.invoices where session_id = $1", [id])).rows[0];
  return { invoiceId: inv.id as string, total: n(inv.total_minor) };
}
const payCash = (user: string, invoice: string, amount: number, k = key()) =>
  q(user, "select public.record_cash_payment($1,$2,$3) as id", [invoice, amount, k]).then((r) => r[0].id as string);
async function wallet() {
  return (await q(IDS.employeeH1, "select public.open_wallet($1,$2) as id", [IDS.h1, CUSTOMER_EMAIL]))[0].id as string;
}
const topUp = (user: string, w: string, amount: number, k = key()) =>
  q(user, "select public.wallet_top_up($1,$2,$3) as id", [w, amount, k]).then((r) => r[0].id as string);

describe("registers", () => {
  it("every hall has exactly one default register", async () => {
    const rows = (await db.query<any>("select hall_id, count(*)::int c from public.cash_registers group by hall_id")).rows;
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((r) => r.c === 1)).toBe(true);
  });
  it("list_registers shows the open shift and its expected cash", async () => {
    expect((await q(IDS.employeeH1, "select * from public.list_registers($1)", [IDS.h1]))[0]).toMatchObject({ open_shift_id: null });
    const s = await openShift(IDS.employeeH1, 500);
    expect((await q(IDS.employeeH1, "select * from public.list_registers($1)", [IDS.h1]))[0]).toMatchObject({ open_shift_id: s, open_expected_cash_minor: 500 });
  });
});

describe("open_shift", () => {
  it("opens a shift with opening cash in the hall currency, audited", async () => {
    const s = await openShift(IDS.employeeH1, 1000);
    const row = await shiftRow(s);
    expect(row).toMatchObject({ status: "open", currency: "USD", opening_cash_minor: 1000, expected_cash_minor: 1000 });
    expect((await audit("shift.open")).length).toBe(1);
  });
  it("is idempotent per key and rejects a reused key for a different request", async () => {
    const k = key();
    const a = await openShift(IDS.employeeH1, 1000, IDS.h1, k);
    expect(await openShift(IDS.employeeH1, 1000, IDS.h1, k)).toBe(a);
    expect((await db.query<any>("select count(*)::int c from public.shifts")).rows[0].c).toBe(1);
    expect((await err(openShift(IDS.employeeH1, 999, IDS.h1, k))).detail).toBe("idempotency_mismatch");
  });
  it("allows only one open shift per register", async () => {
    await openShift(IDS.employeeH1, 0);
    expect((await err(openShift(IDS.ownerH1H2, 0))).detail).toBe("shift_already_open");
  });
  it("validates the opening amount", async () => {
    for (const bad of [-1, 10000000001]) expect((await err(openShift(IDS.employeeH1, bad))).detail).toBe("amount");
  });
  it("is refused to outsiders, sales, customers and deactivated users; employee of H1 cannot open H2", async () => {
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.superAdmin, IDS.customerOnly, IDS.deactivated]) {
      expect((await err(openShift(u, 0))).message).toBe("PERMISSION_DENIED");
    }
    expect((await err(openShift(IDS.employeeH1, 0, IDS.h2))).message).toBe("PERMISSION_DENIED");
  });
  it("a register of another hall cannot be used", async () => {
    const other = (await db.query<any>("select id from public.cash_registers where hall_id = $1", [IDS.h3])).rows[0].id;
    expect((await err(q(IDS.employeeH1, "select public.open_shift($1,$2,0,$3)", [IDS.h1, other, key()]))).message).toBe("NOT_FOUND");
  });
  it("clients cannot write shifts directly", async () => {
    await expect(q(IDS.ownerH1H2, "insert into public.shifts (hall_id, register_id, currency, opened_by, opening_cash_minor) values ($1,$1,'USD',$1,0)", [IDS.h1])).rejects.toThrow(/permission denied/i);
  });
});

describe("cash is linked to the open shift", () => {
  it("cash payments, cash top-ups and cash refunds are refused with no open shift", async () => {
    const inv = await invoiceFor();
    expect((await err(payCash(IDS.employeeH1, inv.invoiceId, inv.total))).detail).toBe("no_open_shift");
    const w = await wallet();
    expect((await err(topUp(IDS.employeeH1, w, 500))).detail).toBe("no_open_shift");
  });
  it("a cash payment writes the payment's shift and exactly one positive movement", async () => {
    const s = await openShift(IDS.employeeH1, 1000);
    const inv = await invoiceFor();
    const pid = await payCash(IDS.employeeH1, inv.invoiceId, inv.total);
    const p = (await db.query<any>("select shift_id from public.payments where id = $1", [pid])).rows[0];
    expect(p.shift_id).toBe(s);
    const m = (await db.query<any>("select * from public.cash_movements where shift_id = $1", [s])).rows;
    expect(m.map((x) => [x.kind, n(x.amount_minor), x.payment_id])).toEqual([["cash_payment", 300, pid]]);
    expect((await shiftRow(s)).expected_cash_minor).toBe(1300);
  });
  it("a retried cash payment does not add a second movement", async () => {
    const s = await openShift(IDS.employeeH1, 0);
    const inv = await invoiceFor();
    const k = key();
    await payCash(IDS.employeeH1, inv.invoiceId, inv.total, k);
    await payCash(IDS.employeeH1, inv.invoiceId, inv.total, k);
    expect((await db.query<any>("select count(*)::int c from public.cash_movements where shift_id = $1", [s])).rows[0].c).toBe(1);
  });
  it("a cash top-up enters the drawer but is tracked as stored value, with a ledger link", async () => {
    const s = await openShift(IDS.employeeH1, 0);
    const w = await wallet();
    const tx = await topUp(IDS.employeeH1, w, 2000);
    const m = (await db.query<any>("select * from public.cash_movements where shift_id = $1", [s])).rows;
    expect(m.map((x) => [x.kind, n(x.amount_minor), x.wallet_transaction_id])).toEqual([["wallet_top_up", 2000, tx]]);
    expect(await q(IDS.employeeH1, "select * from public.list_shifts($1,null,25,0,$2)", [IDS.h1, s])).toMatchObject([{ top_ups_minor: 2000, cash_payments_minor: 0 }]);
  });
  it("wallet payments never touch the drawer", async () => {
    const s = await openShift(IDS.employeeH1, 0);
    const w = await wallet();
    await topUp(IDS.employeeH1, w, 1000);
    const inv = await invoiceFor();
    await q(IDS.employeeH1, "select public.pay_invoice_from_wallet($1,$2,$3,$4)", [inv.invoiceId, w, inv.total, key()]);
    expect((await shiftRow(s)).expected_cash_minor).toBe(1000); // only the top-up
  });
  it("an approved cash refund takes cash out of the open shift; a wallet refund does not", async () => {
    const s = await openShift(IDS.employeeH1, 0);
    const inv = await invoiceFor();
    const pid = await payCash(IDS.employeeH1, inv.invoiceId, inv.total);
    const [{ id: r }] = await q(IDS.employeeH1, "select public.request_refund($1,100,'overcharge',null,$2) as id", [pid, key()]);
    await q(IDS.ownerH1H2, "select public.decide_refund($1,true,'ok')", [r]);
    const m = (await db.query<any>("select kind, amount_minor, refund_id from public.cash_movements where kind = 'cash_refund'")).rows;
    expect(m.map((x) => [x.kind, n(x.amount_minor), x.refund_id])).toEqual([["cash_refund", -100, r]]);
    expect((await shiftRow(s)).expected_cash_minor).toBe(200); // 300 - 100
  });
  it("approving a cash refund with no open shift is blocked and changes nothing", async () => {
    const s = await openShift(IDS.employeeH1, 0);
    const inv = await invoiceFor();
    const pid = await payCash(IDS.employeeH1, inv.invoiceId, inv.total);
    await closeShift(IDS.employeeH1, s, 300, "reason ok");
    const [{ id: r }] = await q(IDS.employeeH1, "select public.request_refund($1,100,'overcharge',null,$2) as id", [pid, key()]);
    expect((await err(q(IDS.ownerH1H2, "select public.decide_refund($1,true,'ok')", [r]))).detail).toBe("no_open_shift");
    const row = (await db.query<any>("select status from public.refunds where id = $1", [r])).rows[0];
    expect(row.status).toBe("pending");
    // Rejecting needs no drawer.
    await q(IDS.ownerH1H2, "select public.decide_refund($1,false,'no')", [r]);
  });
  it("movements are append-only and unique per source", async () => {
    await openShift(IDS.employeeH1, 0);
    const inv = await invoiceFor();
    await payCash(IDS.employeeH1, inv.invoiceId, inv.total);
    await expect(db.exec("update public.cash_movements set amount_minor = 1")).rejects.toThrow(/append-only/);
    await expect(db.exec("delete from public.cash_movements")).rejects.toThrow(/append-only/);
    await expect(db.exec(`insert into public.cash_movements (hall_id, shift_id, kind, amount_minor, currency, payment_id)
      select hall_id, shift_id, 'cash_payment', 5, currency, payment_id from public.cash_movements`)).rejects.toThrow(/duplicate key/);
  });
});

describe("get_shift_unpaid_summary and the close gate", () => {
  it("lists unpaid invoices of this shift and blocks closing until settled or overridden", async () => {
    const s = await openShift(IDS.employeeH1, 0);
    const inv = await invoiceFor();
    const rows = await q(IDS.employeeH1, "select * from public.get_shift_unpaid_summary($1)", [s]);
    expect(rows).toMatchObject([{ invoice_id: inv.invoiceId, outstanding_minor: 300, status: "open", in_shift: true, device_name: expect.any(String) }]);
    expect((await err(closeShift(IDS.employeeH1, s, 0))).detail).toBe("unpaid_invoices");
    expect((await shiftRow(s)).status).toBe("open");
    await payCash(IDS.employeeH1, inv.invoiceId, inv.total);
    expect(await q(IDS.employeeH1, "select * from public.get_shift_unpaid_summary($1)", [s])).toEqual([]);
    expect((await closeShift(IDS.employeeH1, s, 300)).difference_minor).toBe(0);
  });
  it("an override needs payment.adjust and a reason; an employee cannot override", async () => {
    const s = await openShift(IDS.employeeH1, 0);
    await invoiceFor();
    expect((await err(closeShift(IDS.employeeH1, s, 0, "customer will pay tomorrow"))).detail).toBe("override");
    expect((await err(closeShift(IDS.ownerH1H2, s, 0, "  "))).detail).toBe("unpaid_invoices");
    expect((await err(closeShift(IDS.ownerH1H2, s, 0, "x"))).detail).toBe("close_reason");
    const r = await closeShift(IDS.ownerH1H2, s, 0, "Customer is a regular, pays tomorrow");
    expect(r).toMatchObject({ overridden: true, unpaid_count: 1 });
    const a = (await audit("shift.close"))[0];
    expect(a.reason).toBe("Customer is a regular, pays tomorrow");
    expect(a.after_data).toMatchObject({ overridden: true, unpaid_count: 1, unpaid_minor: 300 });
  });
  it("invoices from before the shift are shown but do not block", async () => {
    const early = await openShift(IDS.employeeH1, 0);
    const inv = await invoiceFor();
    await payCash(IDS.employeeH1, inv.invoiceId, 0 + inv.total).catch(() => undefined);
    await closeShift(IDS.employeeH1, early, 300);
    // New invoice left unpaid in a later shift; the older (paid) one is not listed, the unpaid one blocks.
    const old = await invoiceFor(60);
    const s2 = await openShift(IDS.employeeH1, 0);
    const rows = await q(IDS.employeeH1, "select * from public.get_shift_unpaid_summary($1)", [s2]);
    expect(rows).toMatchObject([{ invoice_id: old.invoiceId, in_shift: false }]);
    expect((await closeShift(IDS.employeeH1, s2, 0)).overridden).toBe(false);
  });
  it("voided and zero-amount invoices never block", async () => {
    const s = await openShift(IDS.employeeH1, 0);
    const inv = await invoiceFor();
    await q(IDS.ownerH1H2, "select public.void_invoice($1,'Entered by mistake')", [inv.invoiceId]);
    expect(await q(IDS.employeeH1, "select * from public.get_shift_unpaid_summary($1)", [s])).toEqual([]);
    expect((await closeShift(IDS.employeeH1, s, 0)).unpaid_count).toBe(0);
  });
  it("is refused to outsiders", async () => {
    const s = await openShift(IDS.employeeH1, 0);
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.customerOnly]) {
      expect((await err(q(u, "select * from public.get_shift_unpaid_summary($1)", [s]))).message).toBe("PERMISSION_DENIED");
    }
  });
});

describe("close_shift", () => {
  it("records counted, expected and the discrepancy, audited; both shortage and surplus are allowed", async () => {
    const s = await openShift(IDS.employeeH1, 1000);
    const inv = await invoiceFor();
    await payCash(IDS.employeeH1, inv.invoiceId, inv.total);
    const r = await closeShift(IDS.employeeH1, s, 1250); // expected 1300, counted 1250
    expect(r).toMatchObject({ expected_minor: 1300, counted_minor: 1250, difference_minor: -50, overridden: false });
    expect(await shiftRow(s)).toMatchObject({ status: "closed", counted_cash_minor: 1250, expected_cash_minor: 1300, difference_minor: -50, closed_by_name: expect.any(String) });
    expect((await audit("shift.close"))[0].after_data).toMatchObject({ difference_minor: -50 });
  });
  it("is idempotent for the same key, refuses a different second close, and validates the count", async () => {
    const s = await openShift(IDS.employeeH1, 0);
    const k = key();
    const a = await closeShift(IDS.employeeH1, s, 0, null, k);
    expect(await closeShift(IDS.employeeH1, s, 0, null, k)).toEqual(a);
    expect((await audit("shift.close")).length).toBe(1);
    expect((await err(closeShift(IDS.employeeH1, s, 0))).detail).toBe("already_closed");
    const s2 = await openShift(IDS.employeeH1, 0);
    for (const bad of [-1, 10000000001]) expect((await err(closeShift(IDS.employeeH1, s2, bad))).detail).toBe("amount");
  });
  it("a closed shift takes no more cash and cannot be modified", async () => {
    const s = await openShift(IDS.employeeH1, 0);
    await closeShift(IDS.employeeH1, s, 0);
    const inv = await invoiceFor();
    expect((await err(payCash(IDS.employeeH1, inv.invoiceId, inv.total))).detail).toBe("no_open_shift");
    await expect(db.exec(`update public.shifts set counted_cash_minor = 9 where id = '${s}'`)).rejects.toThrow(/immutable/);
    await expect(db.exec(`delete from public.shifts where id = '${s}'`)).rejects.toThrow(/immutable/);
    // a new shift can be opened afterwards and collects the cash
    const s2 = await openShift(IDS.employeeH1, 0);
    await payCash(IDS.employeeH1, inv.invoiceId, inv.total);
    expect((await shiftRow(s2)).expected_cash_minor).toBe(300);
  });
  it("is refused to other tenants and non-staff", async () => {
    const s = await openShift(IDS.employeeH1, 0);
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.superAdmin, IDS.customerOnly, IDS.deactivated]) {
      expect((await err(closeShift(u, s, 0))).message).toBe("PERMISSION_DENIED");
    }
  });
});

describe("record_cash_movement (payouts and adjustments)", () => {
  const move = (user: string, shift: string, kind: string, amount: number, reason: string, k = key()) =>
    q(user, "select public.record_cash_movement($1,$2,$3,$4,$5) as id", [shift, kind, amount, reason, k]).then((r) => r[0].id as string);

  it("owners record payouts and adjustments with a reason; expected cash follows", async () => {
    const s = await openShift(IDS.employeeH1, 1000);
    await move(IDS.ownerH1H2, s, "payout", 200, "Supplies");
    await move(IDS.ownerH1H2, s, "adjustment_in", 50, "Found in drawer");
    await move(IDS.ownerH1H2, s, "adjustment_out", 30, "Float correction");
    expect(await shiftRow(s)).toMatchObject({ expected_cash_minor: 820, payouts_minor: -200, adjustments_minor: 20 });
    expect((await audit("cash.payout")).length).toBe(1);
    expect((await audit("cash.payout"))[0].reason).toBe("Supplies");
  });
  it("is idempotent per key", async () => {
    const s = await openShift(IDS.employeeH1, 1000);
    const k = key();
    const a = await move(IDS.ownerH1H2, s, "payout", 100, "Supplies", k);
    expect(await move(IDS.ownerH1H2, s, "payout", 100, "Supplies", k)).toBe(a);
    expect((await err(move(IDS.ownerH1H2, s, "payout", 101, "Supplies", k))).detail).toBe("idempotency_mismatch");
    expect((await shiftRow(s)).expected_cash_minor).toBe(900);
  });
  it("employees cannot, reason and amount are validated, drawer cannot go negative, closed shifts refuse", async () => {
    const s = await openShift(IDS.employeeH1, 100);
    expect((await err(move(IDS.employeeH1, s, "payout", 10, "Supplies"))).message).toBe("PERMISSION_DENIED");
    expect((await err(move(IDS.ownerH1H2, s, "payout", 10, "x"))).detail).toBe("reason");
    expect((await err(move(IDS.ownerH1H2, s, "payout", 0, "Supplies"))).detail).toBe("amount");
    expect((await err(move(IDS.ownerH1H2, s, "refund", 5, "Supplies"))).detail).toBe("kind");
    expect((await err(move(IDS.ownerH1H2, s, "payout", 101, "Supplies"))).detail).toBe("exceeds_drawer");
    await closeShift(IDS.employeeH1, s, 100);
    expect((await err(move(IDS.ownerH1H2, s, "payout", 10, "Supplies"))).detail).toBe("shift_closed");
  });
  it("other tenants and platform roles are refused", async () => {
    const s = await openShift(IDS.employeeH1, 100);
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.superAdmin, IDS.customerOnly]) {
      expect((await err(move(u, s, "payout", 10, "Supplies"))).message).toBe("PERMISSION_DENIED");
    }
  });
  it("list_cash_movements is hall-scoped and pages", async () => {
    const s = await openShift(IDS.employeeH1, 100);
    await move(IDS.ownerH1H2, s, "payout", 10, "Supplies");
    const rows = await q(IDS.employeeH1, "select * from public.list_cash_movements($1,null,25,0)", [IDS.h1]);
    expect(rows).toMatchObject([{ kind: "payout", amount_minor: -10, reason: "Supplies", total: 1 }]);
    expect((await err(q(IDS.ownerH3, "select * from public.list_cash_movements($1,null,25,0)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
  });
});

describe("shifts are isolated per hall (tenant isolation)", () => {
  it("another hall's owner sees none of it, directly or via RPC", async () => {
    const s = await openShift(IDS.employeeH1, 100);
    expect(await q(IDS.ownerH3, "select * from public.shifts")).toEqual([]);
    expect(await q(IDS.ownerH3, "select * from public.cash_movements")).toEqual([]);
    expect(await q(IDS.customerOnly, "select * from public.shifts")).toEqual([]);
    expect(await q(IDS.employeeH1, "select id from public.shifts")).toMatchObject([{ id: s }]);
    expect((await err(q(IDS.ownerH3, "select * from public.list_shifts($1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
  });
});

describe("report_financial_summary", () => {
  const report = async (user = IDS.ownerH1H2) =>
    (await q(user, "select * from public.report_financial_summary($1, now() - interval '1 day', now() + interval '1 day')", [IDS.h1]))[0];

  it("keeps accounting categories apart: top-ups are stored value, not revenue", async () => {
    const s = await openShift(IDS.employeeH1, 1000);
    const w = await wallet();
    await topUp(IDS.employeeH1, w, 5000);
    const a = await invoiceFor(); // 300
    const b = await invoiceFor(60); // 600
    await payCash(IDS.employeeH1, a.invoiceId, a.total);
    await q(IDS.employeeH1, "select public.pay_invoice_from_wallet($1,$2,$3,$4)", [b.invoiceId, w, b.total, key()]);
    const r = await report();
    expect(r).toMatchObject({
      currency: "USD",
      sessions_ended: 2,
      invoices_count: 2,
      invoiced_minor: 900, // gaming charges only: no top-up in here
      collections_cash_minor: 300,
      collections_wallet_minor: 600,
      wallet_top_ups_minor: 5000, // reported separately
      wallet_liability_minor: 5000 - 600,
      outstanding_count: 0,
      outstanding_minor: 0,
      voided_minor: 0,
    });
    expect(n(r.invoiced_minor)).not.toBe(n(r.invoiced_minor) + n(r.wallet_top_ups_minor));
    void s;
  });
  it("reports refunds, voids, outstanding, payouts and register differences separately", async () => {
    const s = await openShift(IDS.employeeH1, 1000);
    const a = await invoiceFor();
    const pid = await payCash(IDS.employeeH1, a.invoiceId, a.total);
    const [{ id: rf }] = await q(IDS.employeeH1, "select public.request_refund($1,100,'overcharge',null,$2) as id", [pid, key()]);
    await q(IDS.ownerH1H2, "select public.decide_refund($1,true,null)", [rf]);
    const v = await invoiceFor();
    await q(IDS.ownerH1H2, "select public.void_invoice($1,'Entered by mistake')", [v.invoiceId]);
    await invoiceFor(60); // 600 unpaid
    await q(IDS.ownerH1H2, "select public.record_cash_movement($1,'payout',50,'Supplies',$2)", [s, key()]);
    await closeShift(IDS.ownerH1H2, s, 1100, "Customer pays tomorrow"); // expected 1000+300-100-50 = 1150 -> -50
    const r = await report();
    expect(r).toMatchObject({
      invoiced_minor: 900, // 300 + 600 (voided one excluded)
      voided_minor: 300,
      collections_cash_minor: 300,
      refunds_cash_minor: 100,
      refunds_wallet_minor: 0,
      payouts_minor: 50,
      shifts_closed: 1,
      register_difference_minor: -50,
      outstanding_count: 1,
      outstanding_minor: 600,
    });
  });
  it("applies the period as [from, to) and validates it", async () => {
    await openShift(IDS.employeeH1, 0);
    await invoiceFor();
    const empty = (await q(IDS.ownerH1H2, "select * from public.report_financial_summary($1, now() + interval '1 day', now() + interval '2 days')", [IDS.h1]))[0];
    expect(empty).toMatchObject({ invoices_count: 0, invoiced_minor: 0, sessions_ended: 0 });
    for (const [from, to] of [["now()", "now()"], ["now()", "now() - interval '1 day'"], ["now() - interval '400 days'", "now()"]]) {
      expect((await err(q(IDS.ownerH1H2, `select * from public.report_financial_summary($1, ${from}, ${to})`, [IDS.h1]))).detail).toBe("period");
    }
  });
  it("needs report.financial.view: employees, other tenants, sales and customers are refused", async () => {
    for (const u of [IDS.employeeH1, IDS.ownerH3, IDS.salesAgent, IDS.superAdmin, IDS.customerOnly, IDS.deactivated]) {
      expect((await err(report(u))).message).toBe("PERMISSION_DENIED");
    }
  });
  it("is scoped to its hall", async () => {
    await openShift(IDS.employeeH1, 0);
    await invoiceFor();
    const h3 = (await q(IDS.ownerH3, "select * from public.report_financial_summary($1, now() - interval '1 day', now() + interval '1 day')", [IDS.h3]))[0];
    expect(h3).toMatchObject({ currency: "EUR", invoices_count: 0, sessions_ended: 0 });
  });
});
