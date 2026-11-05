import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

const D = { pc1: "44444444-0000-0000-0000-000000000001" };
const CUSTOMER_EMAIL = "customer.only@example.test";
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
    truncate public.agent_commands cascade;
    truncate public.invoice_counters;
    truncate public.audit_logs;
    truncate public.shifts, public.cash_movements cascade;
    update public.hall_settings set allow_partial_payments = true, payment_methods = array['cash','wallet'],
      billing_increment_minutes = 1, min_billable_minutes = 0;
    update public.pricing_rules set rate_per_hour_minor = 600 where scope = 'hall';
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

async function walletWith(balance: number) {
  const [{ id }] = await q(IDS.employeeH1, "select public.open_wallet($1,$2) as id", [IDS.h1, CUSTOMER_EMAIL]);
  if (balance > 0) await q(IDS.employeeH1, "select public.wallet_top_up($1,$2,$3)", [id, balance, key()]);
  return id as string;
}
const balance = async (w: string) => n((await db.query<any>("select balance_minor from public.wallets where id = $1", [w])).rows[0].balance_minor);
const withdraw = (user: string, w: string, amount: number, reason = "Customer left", k = key()) =>
  q(user, "select public.withdraw_from_wallet($1,$2,$3,$4) as id", [w, amount, reason, k]).then((r) => r[0].id as string);
const freeze = (user: string, w: string, frozen: boolean, reason = "Suspicious activity") =>
  q(user, "select public.set_wallet_status($1,$2,$3)", [w, frozen, reason]);

async function invoice(minutes = 60) {
  const [{ id }] = await q(IDS.employeeH1, "select public.start_walk_in($1,$2,'open',null,null,'Walk-in',$3) as id", [IDS.h1, D.pc1, key()]);
  await db.exec(`update public.sessions set started_at = now() - interval '${minutes} minutes' where id = '${id}'`);
  await q(IDS.employeeH1, "select public.end_session($1,'normal',null)", [id]);
  return (await db.query<any>("select * from public.invoices where session_id = $1", [id])).rows[0];
}
const inv = async (id: string) => (await db.query<any>("select * from public.invoices where id = $1", [id])).rows[0];

describe("freeze and unfreeze", () => {
  it("only owners may; a reason is required; it is audited and retry-safe", async () => {
    const w = await walletWith(1000);
    for (const u of [IDS.employeeH1, IDS.ownerH3, IDS.salesAgent, IDS.superAdmin]) {
      expect((await err(freeze(u, w, true))).message).toBe("PERMISSION_DENIED");
    }
    expect((await err(freeze(OWNER, w, true, " "))).detail).toBe("reason");
    await freeze(OWNER, w, true);
    await freeze(OWNER, w, true); // same state: no-op
    expect((await audit("wallet.freeze")).length).toBe(1);
    expect((await db.query<any>("select status from public.wallets where id = $1", [w])).rows[0].status).toBe("frozen");
    await freeze(OWNER, w, false);
    expect((await audit("wallet.unfreeze")).length).toBe(1);
  });
  it("a frozen wallet cannot be topped up, spent or withdrawn from", async () => {
    const w = await walletWith(1000);
    await freeze(OWNER, w, true);
    expect((await err(q(IDS.employeeH1, "select public.wallet_top_up($1,100,$2)", [w, key()]))).detail).toBe("wallet_frozen");
    expect((await err(withdraw(OWNER, w, 100))).detail).toBe("wallet_frozen");
    const i = await invoice(30);
    expect((await err(q(IDS.employeeH1, "select public.pay_invoice_from_wallet($1,$2,100,$3)", [i.id, w, key()]))).detail).toBe("wallet_frozen");
  });
});

describe("withdrawals", () => {
  it("pays cash out of the shift, lowers the balance, and writes ledger + drawer + audit", async () => {
    const w = await walletWith(1000);
    await withdraw(OWNER, w, 400, "Closing account");
    expect(await balance(w)).toBe(600);
    const ledger = await q(OWNER, "select * from public.list_wallet_ledger($1)", [w]);
    expect(ledger[0]).toMatchObject({ kind: "withdrawal", reason: "Closing account" });
    expect(n(ledger[0].amount_minor)).toBe(-400);
    expect(n(ledger[0].balance_after_minor)).toBe(600);
    const cash = (await db.query<any>("select kind, amount_minor, reason from public.cash_movements where kind = 'payout'")).rows;
    expect(cash).toHaveLength(1);
    expect(n(cash[0].amount_minor)).toBe(-400);
    expect(cash[0].reason).toMatch(/Wallet withdrawal/);
    const [a] = await audit("wallet.withdraw");
    expect(a.after_data.balance_minor).toBe(600);
  });
  it("is owner-only and validates amount, reason and funds", async () => {
    const w = await walletWith(1000);
    for (const u of [IDS.employeeH1, IDS.ownerH3, IDS.salesAgent]) {
      expect((await err(withdraw(u, w, 100))).message).toBe("PERMISSION_DENIED");
    }
    expect((await err(withdraw(OWNER, w, 0))).detail).toBe("amount");
    expect((await err(withdraw(OWNER, w, 100, "x"))).detail).toBe("reason");
    expect((await err(withdraw(OWNER, w, 1001))).message).toBe("INSUFFICIENT_FUNDS");
    expect(await balance(w)).toBe(1000);
  });
  it("needs an open shift and cash in the drawer", async () => {
    const w = await walletWith(1000);
    const [{ id: shift }] = (await db.query<any>("select id from public.shifts where status = 'open'")).rows.map((r) => ({ id: r.id }));
    // The drawer holds the 1000 top-up; withdrawing more than the drawer is refused only if the drawer is short.
    await db.exec(`insert into public.cash_movements (hall_id, shift_id, kind, amount_minor, currency, reason, created_by)
      values ('${IDS.h1}', '${shift}', 'payout', -900, 'USD', 'Earlier payout', '${OWNER}')`);
    expect((await err(withdraw(OWNER, w, 500))).detail).toBe("exceeds_drawer");
  });
  it("is retry-safe and rejects a reused key for another amount", async () => {
    const w = await walletWith(1000);
    const k = key();
    const a = await withdraw(OWNER, w, 100, "Because", k);
    expect(await withdraw(OWNER, w, 100, "Because", k)).toBe(a);
    expect(await balance(w)).toBe(900);
    expect((await err(withdraw(OWNER, w, 200, "Because", k))).detail).toBe("idempotency_mismatch");
  });
});

describe("write-offs", () => {
  const writeOff = (user: string, id: string, amount: number | null, reason = "Customer left without paying", k = key()) =>
    q(user, "select public.write_off_invoice($1,$2,$3,$4) as id", [id, amount, reason, k]).then((r) => r[0].id as string);

  it("removes what is still owed, keeps the record, and closes the invoice", async () => {
    const i = await invoice(60); // 600
    await writeOff(OWNER, i.id, null);
    const after = await inv(i.id);
    expect(n(after.total_minor)).toBe(0);
    expect(after.status).toBe("paid");
    const lines = (await db.query<any>("select amount_minor, detail from public.invoice_items where invoice_id = $1 order by amount_minor", [i.id])).rows;
    expect(lines.map((l) => n(l.amount_minor))).toEqual([-600, 600]);
    expect(lines[0].detail.kind).toBe("write_off");
    expect((await audit("invoice.write_off")).length).toBe(1);
  });
  it("never touches money already paid", async () => {
    const i = await invoice(60);
    await q(IDS.employeeH1, "select public.record_cash_payment($1,400,$2)", [i.id, key()]);
    await writeOff(OWNER, i.id, 100);
    const mid = await inv(i.id);
    expect([n(mid.total_minor), n(mid.paid_minor), n(mid.outstanding_minor), mid.status]).toEqual([500, 400, 100, "partially_paid"]);
    await writeOff(OWNER, i.id, null);
    const done = await inv(i.id);
    expect([n(done.total_minor), n(done.paid_minor), done.status]).toEqual([400, 400, "paid"]);
  });
  it("is owner-only, needs a reason, and refuses more than owed or settled invoices", async () => {
    const i = await invoice(60);
    for (const u of [IDS.employeeH1, IDS.ownerH3, IDS.salesAgent, IDS.superAdmin]) {
      expect((await err(writeOff(u, i.id, null))).message).toBe("PERMISSION_DENIED");
    }
    expect((await err(writeOff(OWNER, i.id, null, "x"))).detail).toBe("reason");
    expect((await err(writeOff(OWNER, i.id, 0))).detail).toBe("amount");
    expect((await err(writeOff(OWNER, i.id, 601))).detail).toBe("exceeds_outstanding");
    await writeOff(OWNER, i.id, null);
    expect((await err(writeOff(OWNER, i.id, null))).detail).toBe("already_paid");
    const voided = await invoice(30);
    await q(OWNER, "select public.void_invoice($1,'mistake')", [voided.id]);
    expect((await err(writeOff(OWNER, voided.id, null))).detail).toBe("invoice_voided");
  });
  it("is retry-safe and append-only", async () => {
    const i = await invoice(60);
    const k = key();
    const a = await writeOff(OWNER, i.id, 100, "Goodwill gap", k);
    expect(await writeOff(OWNER, i.id, 100, "Goodwill gap", k)).toBe(a);
    expect(n((await inv(i.id)).total_minor)).toBe(500);
    await expect(db.exec("update public.invoice_adjustments set amount_minor = 1")).rejects.toThrow(/append-only/);
    await expect(db.exec("delete from public.invoice_adjustments")).rejects.toThrow(/append-only/);
    expect((await err(q(OWNER, "insert into public.invoice_adjustments (hall_id, invoice_id, kind, amount_minor, total_before, total_after, reason) values ($1,$2,'write_off',1,1,0,'xxx')", [IDS.h1, i.id]))).message).toMatch(/permission denied/i);
  });
});

describe("adjustments list and payment detail", () => {
  it("lists write-offs, discounts and voids for owners only", async () => {
    const a = await invoice(60);
    await q(OWNER, "select public.write_off_invoice($1,100,'Gap',$2)", [a.id, key()]);
    const b = await invoice(30);
    await q(OWNER, "select public.void_invoice($1,'mistake')", [b.id]);
    const rows = await q(OWNER, "select * from public.list_adjustments($1)", [IDS.h1]);
    expect(rows.map((r) => r.kind).sort()).toEqual(["void", "write_off"]);
    expect(n(rows[0].total)).toBe(2);
    expect((await err(q(IDS.employeeH1, "select * from public.list_adjustments($1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
    expect((await err(q(IDS.ownerH3, "select * from public.list_adjustments($1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
  });
  it("shows a payment with its operator, refunds and hall scoping", async () => {
    const i = await invoice(60);
    const [{ id: pay }] = await q(IDS.employeeH1, "select public.record_cash_payment($1,600,$2) as id", [i.id, key()]);
    await q(IDS.employeeH1, "select public.request_refund($1,100,'overcharge','note',$2)", [pay, key()]);
    const [d] = await q(IDS.employeeH1, "select * from public.get_payment_detail($1)", [pay]);
    expect(d).toMatchObject({ method: "cash", invoice_number: i.number });
    expect(n(d.amount_minor)).toBe(600);
    expect(n(d.refund_pending_minor)).toBe(100);
    expect(n(d.refunded_minor)).toBe(0);
    expect(d.operator_name).toBeTruthy();
    expect(await q(IDS.employeeH1, "select * from public.list_payment_refunds($1)", [pay])).toHaveLength(1);
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.superAdmin, IDS.customerOnly]) {
      expect((await err(q(u, "select * from public.get_payment_detail($1)", [pay]))).message).toBe("PERMISSION_DENIED");
      expect((await err(q(u, "select * from public.list_payment_refunds($1)", [pay]))).message).toBe("PERMISSION_DENIED");
    }
  });
});
