import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

const D = {
  pc1: "44444444-0000-0000-0000-000000000001", // H1, Agent, all capabilities
  pc2: "44444444-0000-0000-0000-000000000002", // H1, Agent (stale)
  console1: "44444444-0000-0000-0000-000000000003", // H1, no Agent
  h3pc: "44444444-0000-0000-0000-000000000004",
};

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

// Every test starts from a clean slate of reservations/sessions/maintenance.
beforeEach(async () => {
  await db.exec(`
    truncate public.sessions, public.reservations cascade; -- also clears snapshots, invoices, payments
    truncate public.agent_commands cascade;
    delete from public.device_maintenance;
    delete from public.hall_working_hours;
    truncate public.audit_logs; -- TRUNCATE bypasses the append-only row trigger (test cleanup only)
  `);
});

async function q<T = any>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: user, role: "authenticated" }),
    ]);
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
const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const audit = async (action: string) =>
  (await db.query<any>("select * from public.audit_logs where action = $1", [action])).rows;

const reserve = (user: string, device: string, startMin: number, endMin: number, over: { hall?: string; guest?: string | null; k?: string } = {}) =>
  q(user, "select public.create_reservation($1, $2, null, $3, $4, $5, $6) as id", [
    over.hall ?? IDS.h1,
    device,
    over.guest === undefined ? "Guest" : over.guest,
    at(startMin),
    at(endMin),
    over.k ?? key(),
  ]).then((r) => r[0].id as string);

/** Inserts a reservation directly (as the database owner) to set up states the RPC forbids, e.g. the past. */
async function seedReservation(device: string, startMin: number, endMin: number, status = "confirmed") {
  const r = await db.query<any>(
    "insert into public.reservations (hall_id, device_id, guest_name, status, start_at, end_at) values ($1,$2,'Seed',$3,$4,$5) returning id",
    [IDS.h1, device, status, at(startMin), at(endMin)],
  );
  return r.rows[0].id as string;
}
const walkIn = (user: string, device: string, type: "fixed" | "open", minutes: number | null = 60, k = key()) =>
  q(user, "select public.start_walk_in($1, $2, $3, $4, null, 'Walk-in', $5) as id", [IDS.h1, device, type, minutes, k]).then(
    (r) => r[0].id as string,
  );

describe("create_reservation", () => {
  it("creates a confirmed reservation with an event and an audit entry", async () => {
    const id = await reserve(IDS.employeeH1, D.pc1, 60, 120);
    const r = (await db.query<any>("select * from public.reservations where id = $1", [id])).rows[0];
    expect(r).toMatchObject({ status: "confirmed", hall_id: IDS.h1, created_by: IDS.employeeH1 });
    expect((await db.query<any>("select event_type from public.reservation_events where reservation_id = $1", [id])).rows).toEqual([{ event_type: "created" }]);
    expect((await audit("reservation.create")).length).toBe(1);
  });
  it("is idempotent: the same key returns the same reservation; a different payload conflicts", async () => {
    const k = key();
    const [start, end] = [at(60), at(120)]; // a retry resends the identical payload
    const call = (device: string) =>
      q(IDS.employeeH1, "select public.create_reservation($1, $2, null, 'Guest', $3, $4, $5) as id", [IDS.h1, device, start, end, k]);
    const [{ id: a }] = await call(D.pc1);
    const [{ id: b }] = await call(D.pc1);
    expect(b).toBe(a);
    expect((await db.query<any>("select count(*)::int n from public.reservations")).rows[0].n).toBe(1);
    expect((await err(call(D.pc2))).detail).toBe("idempotency_mismatch");
  });
  it("rejects overlapping reservations on the same device but allows touching ones and other devices", async () => {
    await reserve(IDS.employeeH1, D.pc1, 60, 120);
    expect((await err(reserve(IDS.employeeH1, D.pc1, 90, 150))).detail).toBe("reservation_conflict");
    expect((await err(reserve(IDS.employeeH1, D.pc1, 30, 61))).detail).toBe("reservation_conflict");
    await reserve(IDS.employeeH1, D.pc1, 120, 180); // back to back
    await reserve(IDS.employeeH1, D.pc2, 60, 120); // another device
  });
  it("the database itself refuses overlaps even if a function is bypassed (exclusion constraint)", async () => {
    await reserve(IDS.employeeH1, D.pc1, 60, 120);
    await expect(seedReservation(D.pc1, 90, 150)).rejects.toThrow(/reservations_no_overlap|conflicting key/i);
    // Canceled reservations free the slot.
    await seedReservation(D.pc2, 60, 120, "canceled");
    await seedReservation(D.pc2, 90, 150);
  });
  it("validates times, customer and the hall/device pairing", async () => {
    expect((await err(reserve(IDS.employeeH1, D.pc1, 120, 60))).detail).toBe("time_range");
    expect((await err(reserve(IDS.employeeH1, D.pc1, 60, 62))).detail).toBe("time_range");
    expect((await err(reserve(IDS.employeeH1, D.pc1, 60, 60 + 25 * 60))).detail).toBe("time_range");
    expect((await err(reserve(IDS.employeeH1, D.pc1, -120, -60))).detail).toBe("in_the_past");
    expect((await err(reserve(IDS.employeeH1, D.pc1, 60, 120, { guest: null }))).detail).toBe("customer");
    // Device belongs to H3, request names H1.
    expect((await err(reserve(IDS.employeeH1, D.h3pc, 60, 120))).message).toBe("NOT_FOUND");
  });
  it("is blocked by maintenance, disabled devices and running sessions", async () => {
    await q(IDS.employeeH1, "select public.start_maintenance($1, 'Fan', null)", [D.pc1]);
    expect((await err(reserve(IDS.employeeH1, D.pc1, 60, 120))).detail).toBe("maintenance");
    await db.exec(`update public.devices set status = 'disabled' where id = '${D.pc2}'`);
    const e = await err(reserve(IDS.employeeH1, D.pc2, 60, 120));
    expect(e).toMatchObject({ message: "PRECONDITION_FAILED", detail: "device_disabled" });
    await db.exec(`update public.devices set status = 'active' where id = '${D.pc2}'`);
    await walkIn(IDS.employeeH1, D.console1, "open", null);
    expect((await err(reserve(IDS.employeeH1, D.console1, 60, 120))).detail).toBe("device_in_use");
  });
  it("respects working hours in the hall's time zone", async () => {
    // Hall H1 is in Asia/Dubai. Open every day 08:00-23:00 local.
    for (let d = 0; d < 7; d++) {
      await db.exec(`insert into public.hall_working_hours (hall_id, weekday, opens, closes) values ('${IDS.h1}', ${d}, '08:00', '23:00')`);
    }
    const local = (hour: number) =>
      `((date_trunc('day', now() at time zone 'Asia/Dubai') + interval '2 days' + interval '${hour} hours') at time zone 'Asia/Dubai')`;
    const tryAt = async (h1: number, h2: number) => {
      const r = await db.query<any>(`select ${local(h1)} as s, ${local(h2)} as e`);
      return err(q(IDS.employeeH1, "select public.create_reservation($1,$2,null,'G',$3,$4,$5)", [IDS.h1, D.pc1, r.rows[0].s, r.rows[0].e, key()]));
    };
    expect((await tryAt(12, 14)).message).toBe("NO_ERROR");
    expect((await tryAt(3, 5)).detail).toBe("outside_working_hours");
    expect((await tryAt(22, 24)).detail).toBe("outside_working_hours"); // runs past closing
  });
  it("overnight opening hours are honoured", async () => {
    for (let d = 0; d < 7; d++) {
      await db.exec(`insert into public.hall_working_hours (hall_id, weekday, opens, closes) values ('${IDS.h1}', ${d}, '18:00', '02:00')`);
    }
    const local = (hour: number) =>
      `((date_trunc('day', now() at time zone 'Asia/Dubai') + interval '2 days' + interval '${hour} hours') at time zone 'Asia/Dubai')`;
    const r = await db.query<any>(`select ${local(23)} as s, ${local(25)} as e`);
    const ok = await err(q(IDS.employeeH1, "select public.create_reservation($1,$2,null,'G',$3,$4,$5)", [IDS.h1, D.pc1, r.rows[0].s, r.rows[0].e, key()]));
    expect(ok.message).toBe("NO_ERROR");
  });
  it("denies other tenants, sales, customers and deactivated users", async () => {
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.superAdmin, IDS.customerOnly, IDS.deactivated]) {
      expect((await err(reserve(u, D.pc1, 60, 120))).message).toBe("PERMISSION_DENIED");
    }
  });
});

describe("cancel_reservation", () => {
  it("cancels with a reason, records the actor, frees the slot, and is retry-safe", async () => {
    const id = await reserve(IDS.employeeH1, D.pc1, 600, 660);
    await q(IDS.employeeH1, "select public.cancel_reservation($1, 'Customer called')", [id]);
    const r = (await db.query<any>("select * from public.reservations where id = $1", [id])).rows[0];
    expect(r).toMatchObject({ status: "canceled", canceled_by: IDS.employeeH1, cancel_reason: "Customer called" });
    await q(IDS.employeeH1, "select public.cancel_reservation($1, 'again')", [id]); // no error, no change
    expect((await db.query<any>("select cancel_reason from public.reservations where id = $1", [id])).rows[0].cancel_reason).toBe("Customer called");
    await reserve(IDS.employeeH1, D.pc1, 600, 660); // slot is free again
  });
  it("flags cancellations past the deadline instead of hiding them", async () => {
    const id = await reserve(IDS.employeeH1, D.pc1, 20, 80); // deadline default 60 min
    await q(IDS.employeeH1, "select public.cancel_reservation($1, 'late')", [id]);
    const ev = (await db.query<any>("select detail from public.reservation_events where reservation_id = $1 and event_type = 'canceled'", [id])).rows[0];
    expect(ev.detail.past_deadline).toBe(true);
    const early = await reserve(IDS.employeeH1, D.pc2, 600, 660);
    await q(IDS.employeeH1, "select public.cancel_reservation($1, 'early')", [early]);
    const ev2 = (await db.query<any>("select detail from public.reservation_events where reservation_id = $1 and event_type = 'canceled'", [early])).rows[0];
    expect(ev2.detail.past_deadline).toBe(false);
  });
  it("requires a reason, refuses checked-in reservations and other tenants", async () => {
    const id = await reserve(IDS.employeeH1, D.pc1, 600, 660);
    expect((await err(q(IDS.employeeH1, "select public.cancel_reservation($1, ' ')", [id]))).detail).toBe("reason");
    expect((await err(q(IDS.ownerH3, "select public.cancel_reservation($1, 'x')", [id]))).message).toBe("PERMISSION_DENIED");
    const live = await seedReservation(D.pc2, -5, 55);
    await q(IDS.employeeH1, "select public.check_in_reservation($1)", [live]);
    expect((await err(q(IDS.employeeH1, "select public.cancel_reservation($1, 'x')", [live]))).detail).toBe("not_cancelable");
  });
});

describe("check_in_reservation", () => {
  it("creates one fixed session ending at the reserved end, queues START_SESSION for devices with an Agent", async () => {
    const id = await seedReservation(D.pc1, -2, 58);
    const [{ check_in_reservation: sid }] = await q(IDS.employeeH1, "select public.check_in_reservation($1)", [id]);
    const s = (await db.query<any>("select * from public.sessions where id = $1", [sid])).rows[0];
    expect(s).toMatchObject({ session_type: "fixed", status: "in_progress", reservation_id: id, started_by: IDS.employeeH1 });
    expect(new Date(s.scheduled_end_at).getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
    const res = (await db.query<any>("select status, checked_in_by from public.reservations where id = $1", [id])).rows[0];
    expect(res).toMatchObject({ status: "checked_in", checked_in_by: IDS.employeeH1 });
    const cmds = (await db.query<any>("select command_type, status, session_id from public.agent_commands")).rows;
    expect(cmds).toEqual([{ command_type: "START_SESSION", status: "Queued", session_id: sid }]);
    expect((await audit("reservation.check_in")).length).toBe(1);
  });
  it("is retry-safe: a second check-in returns the same session", async () => {
    const id = await seedReservation(D.pc1, -2, 58);
    const [{ check_in_reservation: a }] = await q(IDS.employeeH1, "select public.check_in_reservation($1)", [id]);
    const [{ check_in_reservation: b }] = await q(IDS.employeeH1, "select public.check_in_reservation($1)", [id]);
    expect(b).toBe(a);
    expect((await db.query<any>("select count(*)::int n from public.sessions")).rows[0].n).toBe(1);
    expect((await db.query<any>("select count(*)::int n from public.agent_commands")).rows[0].n).toBe(1);
  });
  it("does not queue Agent commands for devices without an Agent; the session still starts", async () => {
    const id = await seedReservation(D.console1, -2, 58);
    await q(IDS.employeeH1, "select public.check_in_reservation($1)", [id]);
    expect((await db.query<any>("select count(*)::int n from public.agent_commands")).rows[0].n).toBe(0);
    expect((await db.query<any>("select count(*)::int n from public.sessions")).rows[0].n).toBe(1);
  });
  it("late check-in needs the override permission and a reason", async () => {
    const id = await seedReservation(D.pc1, -30, 60); // grace is 10 min
    const asEmployee = await err(q(IDS.employeeH1, "select public.check_in_reservation($1, 'traffic')", [id]));
    expect(asEmployee).toMatchObject({ message: "PERMISSION_DENIED", detail: "late_override" });
    expect((await err(q(IDS.ownerH1H2, "select public.check_in_reservation($1)", [id]))).detail).toBe("override_reason");
    await q(IDS.ownerH1H2, "select public.check_in_reservation($1, 'Customer stuck in traffic')", [id]);
    const r = (await db.query<any>("select late_override_reason, checked_in_by from public.reservations where id = $1", [id])).rows[0];
    expect(r).toEqual({ late_override_reason: "Customer stuck in traffic", checked_in_by: IDS.ownerH1H2 });
    expect((await audit("reservation.check_in"))[0].reason).toBe("Customer stuck in traffic");
  });
  it("refuses expired, canceled and conflicting check-ins", async () => {
    const expired = await seedReservation(D.pc1, -120, -60);
    expect((await err(q(IDS.ownerH1H2, "select public.check_in_reservation($1, 'x')", [expired]))).detail).toBe("expired");
    const canceled = await seedReservation(D.pc2, -2, 58, "canceled");
    expect((await err(q(IDS.employeeH1, "select public.check_in_reservation($1)", [canceled]))).detail).toBe("not_checkable");
    await walkIn(IDS.employeeH1, D.console1, "fixed", 30);
    const blocked = await seedReservation(D.console1, 10, 70);
    // The walk-in occupies the device now; check-in at minute 0 for a reservation starting later overlaps it.
    await db.exec(`update public.reservations set start_at = now() - interval '1 minute' where id = '${blocked}'`);
    expect((await err(q(IDS.employeeH1, "select public.check_in_reservation($1)", [blocked]))).detail).toBe("device_in_use");
  });
  it("is refused to other tenants, sales and customers", async () => {
    const id = await seedReservation(D.pc1, -2, 58);
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.customerOnly]) {
      expect((await err(q(u, "select public.check_in_reservation($1)", [id]))).message).toBe("PERMISSION_DENIED");
    }
  });
});

describe("start_walk_in", () => {
  it("starts fixed and open sessions with events, audit and an Agent command", async () => {
    const f = await walkIn(IDS.employeeH1, D.pc1, "fixed", 45);
    const o = await walkIn(IDS.employeeH1, D.pc2, "open", null);
    const rows = (await db.query<any>("select id, session_type, scheduled_end_at from public.sessions order by session_type")).rows;
    expect(rows.find((r) => r.id === f).scheduled_end_at).not.toBeNull();
    expect(rows.find((r) => r.id === o).scheduled_end_at).toBeNull();
    expect((await db.query<any>("select count(*)::int n from public.agent_commands where command_type = 'START_SESSION'")).rows[0].n).toBe(2);
    expect((await audit("session.start")).length).toBe(2);
  });
  it("is idempotent per key", async () => {
    const k = key();
    const a = await walkIn(IDS.employeeH1, D.pc1, "fixed", 30, k);
    const b = await walkIn(IDS.employeeH1, D.pc1, "fixed", 30, k);
    expect(b).toBe(a);
    expect((await db.query<any>("select count(*)::int n from public.sessions")).rows[0].n).toBe(1);
  });
  it("allows only one live session per device", async () => {
    await walkIn(IDS.employeeH1, D.pc1, "fixed", 30);
    expect((await err(walkIn(IDS.employeeH1, D.pc1, "fixed", 30))).detail).toBe("device_in_use");
    await expect(
      db.exec(`insert into public.sessions (hall_id, device_id, guest_name, session_type, started_by)
               values ('${IDS.h1}', '${D.pc1}', 'x', 'open', '${IDS.employeeH1}')`),
    ).rejects.toThrow(/sessions_one_active_per_device_idx|duplicate key/i);
  });
  it("cannot run into a confirmed reservation; open sessions need no future reservations", async () => {
    await reserve(IDS.employeeH1, D.pc1, 30, 90);
    expect((await err(walkIn(IDS.employeeH1, D.pc1, "fixed", 45))).detail).toBe("reservation_conflict");
    await walkIn(IDS.employeeH1, D.pc1, "fixed", 20); // ends before the reservation starts
    await reserve(IDS.employeeH1, D.pc2, 600, 660);
    expect((await err(walkIn(IDS.employeeH1, D.pc2, "open", null))).detail).toBe("reservation_conflict");
  });
  it("validates input and denies unauthorised callers", async () => {
    expect((await err(walkIn(IDS.employeeH1, D.pc1, "fixed", 1))).detail).toBe("duration");
    expect((await err(walkIn(IDS.employeeH1, D.pc1, "fixed", 9999))).detail).toBe("duration");
    expect((await err(q(IDS.employeeH1, "select public.start_walk_in($1,$2,'fixed',30,null,null,$3)", [IDS.h1, D.pc1, key()]))).detail).toBe("customer");
    expect((await err(q(IDS.employeeH1, "select public.start_walk_in($1,$2,'weird',30,null,'G',$3)", [IDS.h1, D.pc1, key()]))).detail).toBe("session_type");
    expect((await err(q(IDS.employeeH1, "select public.start_walk_in($1,$2,'fixed',30,null,'G',$3)", [IDS.h1, D.h3pc, key()]))).message).toBe("NOT_FOUND");
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.customerOnly]) {
      expect((await err(walkIn(u, D.pc1, "fixed", 30))).message).toBe("PERMISSION_DENIED");
    }
  });
  it("is blocked by maintenance", async () => {
    await q(IDS.employeeH1, "select public.start_maintenance($1, 'Cable', null)", [D.pc1]);
    expect((await err(walkIn(IDS.employeeH1, D.pc1, "fixed", 30)))).toMatchObject({ message: "PRECONDITION_FAILED", detail: "maintenance" });
  });
});

describe("end_session", () => {
  it("records the real duration, queues END_SESSION, and creates an OPEN invoice but no payment", async () => {
    const id = await walkIn(IDS.employeeH1, D.pc1, "fixed", 60);
    await db.exec(`update public.sessions set started_at = now() - interval '25 minutes', scheduled_end_at = now() + interval '35 minutes' where id = '${id}'`);
    const [{ end_session: secs }] = await q(IDS.employeeH1, "select public.end_session($1, 'normal', null)", [id]);
    expect(secs).toBeGreaterThanOrEqual(25 * 60);
    expect(secs).toBeLessThan(26 * 60);
    const s = (await db.query<any>("select * from public.sessions where id = $1", [id])).rows[0];
    expect(s).toMatchObject({ status: "completed", end_type: "normal", ended_by: IDS.employeeH1 });
    const events = (await db.query<any>("select event_type from public.session_events where session_id = $1 order by created_at, event_type", [id])).rows.map((e) => e.event_type);
    expect(events).toContain("invoice_created");
    const inv = (await db.query<any>("select status, paid_minor, total_minor from public.invoices where session_id = $1", [id])).rows[0];
    expect(inv.status).toBe("open");
    expect(Number(inv.paid_minor)).toBe(0);
    expect(Number(inv.total_minor)).toBeGreaterThan(0);
    expect((await db.query<any>("select count(*)::int n from public.payments")).rows[0].n).toBe(0);
    expect((await db.query<any>("select count(*)::int n from public.agent_commands where command_type = 'END_SESSION'")).rows[0].n).toBe(1);
    // The device is free again.
    await walkIn(IDS.employeeH1, D.pc1, "fixed", 30);
  });
  it("is retry-safe for the same end type and refuses a different one", async () => {
    const id = await walkIn(IDS.employeeH1, D.pc1, "open", null);
    const [{ end_session: a }] = await q(IDS.employeeH1, "select public.end_session($1, 'normal', null)", [id]);
    const [{ end_session: b }] = await q(IDS.employeeH1, "select public.end_session($1, 'normal', null)", [id]);
    expect(b).toBe(a);
    expect((await db.query<any>("select count(*)::int n from public.agent_commands where command_type = 'END_SESSION'")).rows[0].n).toBe(1);
    expect((await err(q(IDS.employeeH1, "select public.end_session($1, 'interrupted', 'x')", [id]))).detail).toBe("already_ended");
  });
  it("interrupted and administrative ends need a reason; administrative needs the owner permission", async () => {
    const id = await walkIn(IDS.employeeH1, D.pc1, "open", null);
    expect((await err(q(IDS.employeeH1, "select public.end_session($1, 'interrupted', ' ')", [id]))).detail).toBe("reason");
    expect((await err(q(IDS.employeeH1, "select public.end_session($1, 'administrative', 'cleanup')", [id]))).detail).toBe("administrative_end");
    expect((await err(q(IDS.employeeH1, "select public.end_session($1, 'nonsense', 'x')", [id]))).detail).toBe("end_type");
    await q(IDS.ownerH1H2, "select public.end_session($1, 'administrative', 'Hall closing')", [id]);
    expect((await db.query<any>("select status, end_type from public.sessions where id = $1", [id])).rows[0]).toEqual({ status: "completed", end_type: "administrative" });
    const id2 = await walkIn(IDS.employeeH1, D.pc2, "open", null);
    await q(IDS.employeeH1, "select public.end_session($1, 'interrupted', 'Power cut')", [id2]);
    expect((await db.query<any>("select status from public.sessions where id = $1", [id2])).rows[0].status).toBe("interrupted");
  });
  it("is refused to other tenants and sales", async () => {
    const id = await walkIn(IDS.employeeH1, D.pc1, "open", null);
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.customerOnly]) {
      expect((await err(q(u, "select public.end_session($1, 'normal', null)", [id]))).message).toBe("PERMISSION_DENIED");
    }
  });
});

describe("extend_session", () => {
  it("extends the scheduled end, records operator and reason, and is idempotent", async () => {
    const id = await walkIn(IDS.employeeH1, D.pc1, "fixed", 30);
    const before = new Date((await db.query<any>("select scheduled_end_at from public.sessions where id = $1", [id])).rows[0].scheduled_end_at).getTime();
    const k = key();
    const call = () => q(IDS.employeeH1, "select public.extend_session($1, 15, 'Customer asked', $2) as e", [id, k]);
    const [{ e: first }] = await call();
    const [{ e: second }] = await call();
    expect(new Date(first).getTime() - before).toBe(15 * 60_000);
    expect(second).toEqual(first);
    const s = (await db.query<any>("select extension_count from public.sessions where id = $1", [id])).rows[0];
    expect(s.extension_count).toBe(1);
    const ev = (await db.query<any>("select actor_id, reason from public.session_events where event_type = 'extended'")).rows;
    expect(ev).toEqual([{ actor_id: IDS.employeeH1, reason: "Customer asked" }]);
    expect((await audit("session.extend")).length).toBe(1);
  });
  it("is rejected when it would collide with a reservation", async () => {
    const id = await walkIn(IDS.employeeH1, D.pc1, "fixed", 20);
    await reserve(IDS.employeeH1, D.pc1, 30, 90);
    expect((await err(q(IDS.employeeH1, "select public.extend_session($1, 15, 'x', $2)", [id, key()]))).detail).toBe("reservation_conflict");
    await q(IDS.employeeH1, "select public.extend_session($1, 10, 'fits', $2)", [id, key()]); // ends exactly at the reservation start
  });
  it("only fixed, running sessions; validates minutes and reason", async () => {
    const open = await walkIn(IDS.employeeH1, D.pc1, "open", null);
    expect((await err(q(IDS.employeeH1, "select public.extend_session($1, 15, 'x', $2)", [open, key()]))).detail).toBe("not_extendable");
    const fixed = await walkIn(IDS.employeeH1, D.pc2, "fixed", 30);
    expect((await err(q(IDS.employeeH1, "select public.extend_session($1, 0, 'x', $2)", [fixed, key()]))).detail).toBe("minutes");
    expect((await err(q(IDS.employeeH1, "select public.extend_session($1, 5, ' ', $2)", [fixed, key()]))).detail).toBe("reason");
    for (const u of [IDS.ownerH3, IDS.salesAgent]) {
      expect((await err(q(u, "select public.extend_session($1, 5, 'x', $2)", [fixed, key()]))).message).toBe("PERMISSION_DENIED");
    }
  });
});

describe("convert_session_to_open", () => {
  it("converts when scheduling allows, with reason, and is retry-safe", async () => {
    const id = await walkIn(IDS.employeeH1, D.pc1, "fixed", 30);
    await q(IDS.employeeH1, "select public.convert_session_to_open($1, 'Customer staying')", [id]);
    await q(IDS.employeeH1, "select public.convert_session_to_open($1, 'again')", [id]);
    const s = (await db.query<any>("select session_type, scheduled_end_at, converted_to_open from public.sessions where id = $1", [id])).rows[0];
    expect(s).toEqual({ session_type: "open", scheduled_end_at: null, converted_to_open: true });
    expect((await db.query<any>("select count(*)::int n from public.session_events where event_type = 'converted_to_open'")).rows[0].n).toBe(1);
  });
  it("is refused when a reservation is coming up", async () => {
    const id = await walkIn(IDS.employeeH1, D.pc1, "fixed", 20);
    await reserve(IDS.employeeH1, D.pc1, 120, 180);
    expect((await err(q(IDS.employeeH1, "select public.convert_session_to_open($1, 'x')", [id]))).detail).toBe("reservation_conflict");
    expect((await db.query<any>("select session_type from public.sessions where id = $1", [id])).rows[0].session_type).toBe("fixed");
  });
});

describe("expire_no_shows (job entry point)", () => {
  it("marks only confirmed reservations past the grace period, and is repeatable", async () => {
    const late = await seedReservation(D.pc1, -30, 30);
    const fresh = await seedReservation(D.pc2, 30, 90);
    const inGrace = await seedReservation(D.console1, -5, 55);
    expect((await db.query<any>("select public.expire_no_shows() as n")).rows[0].n).toBe(1);
    expect((await db.query<any>("select public.expire_no_shows() as n")).rows[0].n).toBe(0);
    const statuses = Object.fromEntries((await db.query<any>("select id, status from public.reservations")).rows.map((r) => [r.id, r.status]));
    expect(statuses).toMatchObject({ [late]: "no_show", [fresh]: "confirmed", [inGrace]: "confirmed" });
  });
  it("cannot be called by clients", async () => {
    await expect(q(IDS.ownerH1H2, "select public.expire_no_shows()")).rejects.toThrow(/permission denied/i);
  });
});

describe("reads and isolation", () => {
  it("list_reservations filters by window and status and shows names", async () => {
    const id = await reserve(IDS.employeeH1, D.pc1, 60, 120);
    const rows = await q(IDS.employeeH1, "select * from public.list_reservations($1, $2, $3)", [IDS.h1, at(0), at(600)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, device_name: "PC-01", customer_name: "Guest", status: "confirmed" });
    expect(await q(IDS.employeeH1, "select * from public.list_reservations($1, $2, $3, 'canceled')", [IDS.h1, at(0), at(600)])).toEqual([]);
  });
  it("list_sessions pages and can show active sessions only", async () => {
    const a = await walkIn(IDS.employeeH1, D.pc1, "open", null);
    await walkIn(IDS.employeeH1, D.pc2, "open", null);
    await q(IDS.employeeH1, "select public.end_session($1, 'normal', null)", [a]);
    const active = await q(IDS.employeeH1, "select * from public.list_sessions($1, true)", [IDS.h1]);
    expect(active).toHaveLength(1);
    const all = await q(IDS.employeeH1, "select * from public.list_sessions($1, false, 1, 0)", [IDS.h1]);
    expect(all).toHaveLength(1);
    expect(Number(all[0].total)).toBe(2);
  });
  it("the live view reflects current session and next reservation", async () => {
    await walkIn(IDS.employeeH1, D.pc1, "fixed", 30);
    await reserve(IDS.employeeH1, D.pc2, 600, 660);
    const rows = await q(IDS.employeeH1, "select name, effective_availability, current_session_type, next_reservation_at from public.v_device_live_status order by name");
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(by["PC-01"]).toMatchObject({ effective_availability: "in_use", current_session_type: "fixed" });
    expect(by["PC-02"].next_reservation_at).not.toBeNull();
    expect(by["Console-01"].effective_availability).toBe("available");
  });
  it("other tenants, sales and customers see no reservations or sessions", async () => {
    await reserve(IDS.employeeH1, D.pc1, 60, 120);
    await walkIn(IDS.employeeH1, D.pc2, "open", null);
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.superAdmin, IDS.customerOnly]) {
      for (const t of ["reservations", "reservation_events", "sessions", "session_events"]) {
        expect(await q(u, `select * from public.${t}`)).toEqual([]);
      }
      expect((await err(q(u, "select * from public.list_sessions($1)", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
      expect((await err(q(u, "select * from public.list_reservations($1, now(), now() + interval '1 day')", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
    }
  });
  it("clients cannot write reservations or sessions directly", async () => {
    await expect(q(IDS.ownerH1H2, "update public.reservations set status = 'canceled'")).rejects.toThrow(/permission denied/i);
    await expect(q(IDS.ownerH1H2, "insert into public.sessions (hall_id, device_id, guest_name, session_type, scheduled_end_at) values ($1,$2,'x','fixed', now()+interval '1 hour')", [IDS.h1, D.pc1])).rejects.toThrow(/permission denied/i);
  });
  it("employees get the new late-override permission only via the owner role", async () => {
    const ctx = async (u: string) => (await q(u, "select public.get_my_context() as c"))[0].c.memberships[0].permissions as string[];
    expect(await ctx(IDS.ownerH1H2)).toContain("reservation.override_late");
    expect(await ctx(IDS.employeeH1)).not.toContain("reservation.override_late");
  });
  it("server_now returns a time close to the database clock", async () => {
    const [{ server_now }] = await q(IDS.employeeH1, "select public.server_now()");
    expect(Math.abs(new Date(server_now).getTime() - Date.now())).toBeLessThan(5000);
  });
});
