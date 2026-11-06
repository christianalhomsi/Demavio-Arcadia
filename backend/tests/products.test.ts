import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

const D = {
  pc1: "44444444-0000-0000-0000-000000000001", // H1
  pc2: "44444444-0000-0000-0000-000000000002", // H1
};

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    truncate public.sessions, public.reservations cascade; -- also clears items, snapshots, invoices
    truncate public.session_items cascade;
    truncate public.products cascade;
    truncate public.invoice_counters;
    truncate public.agent_commands cascade;
    truncate public.audit_logs;
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

const product = (user: string, hall: string, name: string, price: number, active = true, id: string | null = null) =>
  q(user, "select public.upsert_product($1, $2, $3, $4, $5) as id", [hall, id, name, price, active]).then((r) => r[0].id as string);
const openSession = (device = D.pc1) =>
  q(IDS.employeeH1, "select public.start_walk_in($1,$2,'open',null,null,'Walk-in',$3) as id", [IDS.h1, device, key()]).then((r) => r[0].id as string);
const addItem = (user: string, session: string, prod: string, qty = 1, k = key()) =>
  q(user, "select public.add_session_item($1, $2, $3, $4) as id", [session, prod, qty, k]).then((r) => r[0].id as string);
const items = (user: string, session: string) => q(user, "select * from public.list_session_items($1)", [session]);

describe("catalog permissions and validation", () => {
  it("only owners manage; employees sell; outsiders and former staff do nothing", async () => {
    expect((await err(product(IDS.employeeH1, IDS.h1, "Cola", 150))).message).toBe("PERMISSION_DENIED");
    expect((await err(product(IDS.ownerH3, IDS.h1, "Cola", 150))).message).toBe("PERMISSION_DENIED");
    await product(IDS.ownerH1H2, IDS.h1, "Cola", 150);
    await product(IDS.ownerH1H2, IDS.h1, "Retired chips", 100, false);

    const seller = await q(IDS.employeeH1, "select * from public.list_products($1)", [IDS.h1]);
    expect(seller.map((p) => p.name)).toEqual(["Cola"]); // sellers only see what they can sell
    const owner = await q(IDS.ownerH1H2, "select * from public.list_products($1)", [IDS.h1]);
    expect(owner.map((p) => p.name)).toEqual(["Cola", "Retired chips"]);
    expect(Number(owner[0].price_minor)).toBe(150);
    expect(owner[0].currency).toBe("USD");

    expect((await err(q(IDS.formerEmployeeH1, "select * from public.list_products($1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
    expect((await err(q(IDS.customerOnly, "select * from public.list_products($1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
  });

  it("validates name and price, keeps names unique per hall, and is scoped to the hall", async () => {
    expect((await err(product(IDS.ownerH1H2, IDS.h1, "  ", 100))).detail).toBe("name");
    expect((await err(product(IDS.ownerH1H2, IDS.h1, "x".repeat(61), 100))).detail).toBe("name");
    expect((await err(product(IDS.ownerH1H2, IDS.h1, "Bad", -1))).detail).toBe("price");
    expect((await err(product(IDS.ownerH1H2, IDS.h1, "Bad", 100_000_001))).detail).toBe("price");

    const id = await product(IDS.ownerH1H2, IDS.h1, "Cola", 150);
    expect((await err(product(IDS.ownerH1H2, IDS.h1, "cola", 200))).detail).toBe("product_name_taken");
    await expect(product(IDS.ownerH1H2, IDS.h2, "Cola", 150)).resolves.toBeTruthy(); // other hall, same name
    // A product of H1 cannot be edited through H2.
    expect((await err(product(IDS.ownerH1H2, IDS.h2, "Hacked", 1, true, id))).message).toBe("NOT_FOUND");

    await product(IDS.ownerH1H2, IDS.h1, "Cola", 175, true, id);
    const [row] = await q(IDS.ownerH1H2, "select * from public.list_products($1) where id = $2", [IDS.h1, id]);
    expect(Number(row.price_minor)).toBe(175);
    const a = await audit("product.update");
    expect(a).toHaveLength(1);
    expect(a[0].before_data.price_minor).toBe(150);
    expect(a[0].after_data.price_minor).toBe(175);
  });

  it("clients cannot write the tables directly", async () => {
    expect((await err(q(IDS.ownerH1H2, "insert into public.products (hall_id, name, price_minor) values ($1,'x',1)", [IDS.h1]))).message).toMatch(/permission denied/i);
    expect((await err(q(IDS.ownerH1H2, "update public.session_items set quantity = 99"))).message).toMatch(/permission denied/i);
  });
});

describe("session items", () => {
  it("snapshots name and price from the catalog; later price changes do not touch the line", async () => {
    const cola = await product(IDS.ownerH1H2, IDS.h1, "Cola", 150);
    const s = await openSession();
    await addItem(IDS.employeeH1, s, cola, 2);
    await product(IDS.ownerH1H2, IDS.h1, "Cola Zero", 999, true, cola); // catalog edit after the sale
    const rows = await items(IDS.employeeH1, s);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Cola", quantity: 2, currency: "USD" });
    expect(Number(rows[0].unit_price_minor)).toBe(150);
    expect(Number(rows[0].line_minor)).toBe(300);
    expect((await audit("session.item.add")).length).toBe(0); // no longer audited (…000045)
  });

  it("rejects bad quantities, inactive and foreign products, outsiders and ended sessions", async () => {
    const cola = await product(IDS.ownerH1H2, IDS.h1, "Cola", 150);
    const off = await product(IDS.ownerH1H2, IDS.h1, "Off", 100, false);
    const foreign = await product(IDS.ownerH3, IDS.h3, "Foreign", 100);
    const s = await openSession();

    expect((await err(addItem(IDS.employeeH1, s, cola, 0))).detail).toBe("quantity");
    expect((await err(addItem(IDS.employeeH1, s, cola, 100))).detail).toBe("quantity");
    expect((await err(addItem(IDS.employeeH1, s, off))).detail).toBe("product_inactive");
    expect((await err(addItem(IDS.employeeH1, s, foreign))).message).toBe("NOT_FOUND");
    expect((await err(addItem(IDS.ownerH3, s, cola))).message).toBe("PERMISSION_DENIED");
    expect((await err(addItem(IDS.formerEmployeeH1, s, cola))).message).toBe("PERMISSION_DENIED");
    expect((await err(items(IDS.ownerH3, s))).message).toBe("PERMISSION_DENIED");

    await q(IDS.employeeH1, "select public.end_session($1,'normal',null)", [s]);
    expect((await err(addItem(IDS.employeeH1, s, cola))).detail).toBe("session_ended");
  });

  it("is idempotent per key and refuses a key reused for something else", async () => {
    const cola = await product(IDS.ownerH1H2, IDS.h1, "Cola", 150);
    const chips = await product(IDS.ownerH1H2, IDS.h1, "Chips", 200);
    const s = await openSession();
    const k = key();
    const a = await addItem(IDS.employeeH1, s, cola, 1, k);
    const b = await addItem(IDS.employeeH1, s, cola, 1, k);
    expect(b).toBe(a);
    expect(await items(IDS.employeeH1, s)).toHaveLength(1);
    expect((await err(addItem(IDS.employeeH1, s, chips, 1, k))).detail).toBe("idempotency_mismatch");
  });

  it("removes softly, is retry-safe, keeps the history, and locks once the session ended", async () => {
    const cola = await product(IDS.ownerH1H2, IDS.h1, "Cola", 150);
    const s = await openSession();
    const item = await addItem(IDS.employeeH1, s, cola, 1);
    await q(IDS.employeeH1, "select public.remove_session_item($1)", [item]);
    await q(IDS.employeeH1, "select public.remove_session_item($1)", [item]); // retry
    expect(await items(IDS.employeeH1, s)).toHaveLength(0);
    const row = (await db.query<any>("select removed_at, removed_by from public.session_items where id = $1", [item])).rows[0];
    expect(row.removed_at).not.toBeNull();
    expect(row.removed_by).toBe(IDS.employeeH1);
    const events = (await db.query<any>("select event_type from public.session_events where session_id = $1 order by created_at", [s])).rows.map((e) => e.event_type);
    expect(events).toEqual(expect.arrayContaining(["item_added", "item_removed"]));
    expect((await audit("session.item.remove")).length).toBe(0); // no longer audited (…000045)

    const other = await addItem(IDS.employeeH1, s, cola, 1);
    await q(IDS.employeeH1, "select public.end_session($1,'normal',null)", [s]);
    expect((await err(q(IDS.employeeH1, "select public.remove_session_item($1)", [other]))).detail).toBe("session_ended");
    expect((await err(q(IDS.ownerH3, "select public.remove_session_item($1)", [other]))).message).toBe("PERMISSION_DENIED");
  });
});

describe("invoice", () => {
  it("adds one line per kept item and the item total to the invoice", async () => {
    const cola = await product(IDS.ownerH1H2, IDS.h1, "Cola", 150);
    const chips = await product(IDS.ownerH1H2, IDS.h1, "Chips", 200);
    const s = await openSession();
    await addItem(IDS.employeeH1, s, cola, 2);
    await addItem(IDS.employeeH1, s, chips, 1);
    const dropped = await addItem(IDS.employeeH1, s, chips, 5);
    await q(IDS.employeeH1, "select public.remove_session_item($1)", [dropped]);
    await q(IDS.employeeH1, "select public.end_session($1,'normal',null)", [s]);

    const inv = (await db.query<any>("select * from public.invoices where session_id = $1", [s])).rows[0];
    const lines = (await db.query<any>("select description, amount_minor, detail from public.invoice_items where invoice_id = $1 order by amount_minor", [inv.id])).rows;
    const productLines = lines.filter((l) => l.detail.kind === "product");
    expect(productLines.map((l) => [l.description, Number(l.amount_minor), l.detail.quantity])).toEqual([
      ["Chips", 200, 1],
      ["Cola", 300, 2],
    ]);
    expect(lines.filter((l) => l.detail.kind === "session")).toHaveLength(1);
    // Time is ~0 here (ended right away, no minimum billable time), so the total is the items.
    const sessionLine = lines.find((l) => l.detail.kind === "session");
    expect(Number(inv.total_minor)).toBe(Number(sessionLine.amount_minor) + 500);
    expect(inv.status).toBe("open");
    expect(Number(inv.paid_minor)).toBe(0);
  });

  it("a session without items invoices exactly as before", async () => {
    const s = await openSession(D.pc2);
    await q(IDS.employeeH1, "select public.end_session($1,'normal',null)", [s]);
    const inv = (await db.query<any>("select total_minor from public.invoices where session_id = $1", [s])).rows[0];
    const lines = (await db.query<any>("select amount_minor, detail from public.invoice_items i join public.invoices v on v.id = i.invoice_id where v.session_id = $1", [s])).rows;
    expect(lines).toHaveLength(1);
    expect(Number(inv.total_minor)).toBe(Number(lines[0].amount_minor));
  });
});
