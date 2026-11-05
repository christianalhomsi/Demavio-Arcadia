import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

const D = {
  pc1: "44444444-0000-0000-0000-000000000001", // H1, Standard category, flat priced
  console1: "44444444-0000-0000-0000-000000000003", // H1, priced by players in these tests
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
    truncate public.sessions, public.reservations cascade;
    truncate public.agent_commands cascade;
    delete from public.device_maintenance;
    delete from public.hall_working_hours;
    delete from public.pricing_rules where scope = 'device';
    truncate public.audit_logs;
  `);
});

/** Runs a statement the way PostgREST does for a signed-in user, or for anon when user is null. */
async function q<T = any>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec("begin");
  try {
    if (user) {
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: user, role: "authenticated" }),
      ]);
      await db.exec("set local role authenticated");
    } else {
      await db.exec("set local role anon");
    }
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

const PLAYER = IDS.customerOnly;
const OTHER = IDS.ownerH3;
const key = () => crypto.randomUUID();
const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

const book = (user: string | null, device: string, startMin: number, endMin: number, players: number | null = null) =>
  q(user, "select public.create_player_reservation($1, $2, $3, $4, $5) as id", [
    device,
    at(startMin),
    at(endMin),
    key(),
    players,
  ]).then((r) => r[0].id as string);

const status = async (id: string) =>
  (await db.query<any>("select status, players_count, cancel_reason from public.reservations where id = $1", [id])).rows[0];

/** Console-01 becomes a players-priced device: 2 players 5.00/h, 4 players 8.00/h. */
async function priceByPlayers() {
  await db.query(
    `insert into public.pricing_rules (hall_id, scope, device_id, rate_per_hour_minor, players_count) values
       ($1, 'device', $2, 500, 2), ($1, 'device', $2, 800, 4)`,
    [IDS.h1, D.console1],
  );
}

describe("anonymous browsing", () => {
  it("lists active halls, devices and busy ranges without a session", async () => {
    const halls = await q(null, "select * from public.list_public_halls()");
    expect(halls.map((h) => h.id)).toContain(IDS.h1);
    const devices = await q(null, "select * from public.list_public_devices($1)", [IDS.h1]);
    expect(devices.map((d) => d.name)).toEqual(expect.arrayContaining(["PC-01", "Console-01"]));
    const hall = await q(null, "select * from public.get_public_hall($1)", [IDS.h1]);
    expect(hall[0].currency).toBe("USD");

    await book(PLAYER, D.pc1, 120, 180);
    const busy = await q(null, "select * from public.list_public_device_busy($1, $2, $3)", [D.pc1, at(0), at(24 * 60)]);
    expect(busy).toHaveLength(1);
    expect(Object.keys(busy[0])).toEqual(["start_at", "end_at"]); // no who, no why
  });

  it("cannot read tables or book, and a huge busy window is refused", async () => {
    expect((await err(q(null, "select * from public.reservations"))).message).toMatch(/permission denied/i);
    expect((await err(q(null, "select * from public.profiles"))).message).toMatch(/permission denied/i);
    expect(
      (await err(q(null, "select public.create_player_reservation($1, $2, $3, $4, null)", [D.pc1, at(60), at(120), key()]))).message,
    ).toMatch(/permission denied/i);
    expect((await err(q(null, "select * from public.list_my_reservations()"))).message).toMatch(/permission denied/i);
    const big = await err(q(null, "select * from public.list_public_device_busy($1, $2, $3)", [D.pc1, at(0), at(24 * 60 * 30)]));
    expect(big.detail).toBe("period");
  });

  it("hides inactive halls and disabled devices", async () => {
    await db.query("update public.halls set status = 'inactive' where id = $1", [IDS.h2]);
    await db.query("update public.devices set status = 'disabled' where id = $1", [D.console1]);
    try {
      const halls = await q(null, "select id from public.list_public_halls()");
      expect(halls.map((h) => h.id)).not.toContain(IDS.h2);
      const devices = await q(null, "select name from public.list_public_devices($1)", [IDS.h1]);
      expect(devices.map((d) => d.name)).not.toContain("Console-01");
    } finally {
      await db.query("update public.halls set status = 'active' where id = $1", [IDS.h2]);
      await db.query("update public.devices set status = 'active' where id = $1", [D.console1]);
    }
  });
});

describe("player booking", () => {
  it("creates a pending reservation for the caller that holds the slot", async () => {
    const id = await book(PLAYER, D.pc1, 120, 180);
    expect((await status(id)).status).toBe("pending");
    const row = (await db.query<any>("select customer_id, created_by from public.reservations where id = $1", [id])).rows[0];
    expect(row.customer_id).toBe(PLAYER);
    // Staff cannot book over the pending request, and another player cannot either.
    const staff = await err(
      q(IDS.employeeH1, "select public.create_reservation($1, $2, null, 'Guest', $3, $4, $5)", [IDS.h1, D.pc1, at(150), at(200), key()]),
    );
    expect(staff.detail).toBe("reservation_conflict");
    expect((await err(book(OTHER, D.pc1, 130, 170))).detail).toBe("reservation_conflict");
  });

  it("is idempotent for the same key and rejects the same key with other details", async () => {
    const k = key();
    const a = await q(PLAYER, "select public.create_player_reservation($1,$2,$3,$4,null) as id", [D.pc1, at(120), at(180), k]);
    const startFixed = (await db.query<any>("select start_at, end_at from public.reservations where id = $1", [a[0].id])).rows[0];
    const again = await q(PLAYER, "select public.create_player_reservation($1,$2,$3,$4,null) as id", [
      D.pc1,
      startFixed.start_at.toISOString(),
      startFixed.end_at.toISOString(),
      k,
    ]);
    expect(again[0].id).toBe(a[0].id);
    const mismatch = await err(
      q(PLAYER, "select public.create_player_reservation($1,$2,$3,$4,null)", [D.pc1, at(300), at(360), k]),
    );
    expect(mismatch.detail).toBe("idempotency_mismatch");
  });

  it("validates time range, working hours, past and unknown devices", async () => {
    expect((await err(book(PLAYER, D.pc1, 60, 60 + 5 * 60))).detail).toBe("time_range"); // > 4 hours
    expect((await err(book(PLAYER, D.pc1, 60, 62))).detail).toBe("time_range"); // < 5 minutes
    expect((await err(book(PLAYER, D.pc1, -120, -60))).detail).toBe("in_the_past");
    expect((await err(book(PLAYER, "44444444-0000-0000-0000-0000000000ff", 60, 120))).message).toBe("NOT_FOUND");
    // Hall open only on a weekday that is not today or tomorrow's start: use a range that excludes the slot.
    await db.query(
      "insert into public.hall_working_hours (hall_id, weekday, opens, closes) select $1, ((extract(dow from now() + interval '3 days'))::int), '10:00', '11:00'",
      [IDS.h1],
    );
    expect((await err(book(PLAYER, D.pc1, 60, 120))).detail).toBe("outside_working_hours");
  });

  it("limits a player to 5 upcoming active bookings and ignores canceled ones", async () => {
    for (let i = 0; i < 5; i++) await book(PLAYER, D.pc1, 600 + i * 120, 660 + i * 120);
    expect((await err(book(PLAYER, D.pc1, 1500, 1560))).detail).toBe("too_many");
    // Another player is unaffected.
    await expect(book(OTHER, D.pc1, 1500, 1560)).resolves.toBeTruthy();
    const mine = await q(PLAYER, "select id from public.list_my_reservations()");
    await q(PLAYER, "select public.cancel_my_reservation($1)", [mine[0].id]);
    await expect(book(PLAYER, D.pc1, 1700, 1760)).resolves.toBeTruthy();
  });
});

describe("pricing by number of players", () => {
  it("flat devices have no player options and ignore the field", async () => {
    const [d] = await q(null, "select player_options from public.list_public_devices($1) where id = $2", [IDS.h1, D.pc1]);
    expect(d.player_options).toEqual([]);
    const id = await book(PLAYER, D.pc1, 120, 180, 4);
    expect((await status(id)).players_count).toBeNull();
  });

  it("requires a configured count and quotes the matching rate", async () => {
    await priceByPlayers();
    const [d] = await q(null, "select player_options from public.list_public_devices($1) where id = $2", [IDS.h1, D.console1]);
    expect(d.player_options).toEqual([2, 4]);

    expect((await err(book(PLAYER, D.console1, 120, 180, null))).detail).toBe("players");
    expect((await err(book(PLAYER, D.console1, 120, 180, 3))).detail).toBe("players");

    const two = await q(null, "select * from public.quote_public_price($1, 2, $2, $3)", [D.console1, at(120), at(180)]);
    expect(two[0].currency).toBe("USD");
    expect(Number(two[0].rate_per_hour_minor)).toBe(500);
    expect(Number(two[0].estimated_minor)).toBe(500);
    const four = await q(null, "select * from public.quote_public_price($1, 4, $2, $3)", [D.console1, at(120), at(210)]);
    expect(Number(four[0].rate_per_hour_minor)).toBe(800);
    expect(Number(four[0].estimated_minor)).toBe(1200); // 90 minutes at 8.00/h
    expect((await err(q(null, "select * from public.quote_public_price($1, null, $2, $3)", [D.console1, at(1), at(61)]))).detail).toBe("players");
  });

  it("falls back device > category > hall for flat devices and quotes the hall rate", async () => {
    const hall = await q(null, "select * from public.quote_public_price($1, null, $2, $3)", [D.pc1, at(60), at(120)]);
    expect(Number(hall[0].rate_per_hour_minor)).toBe(600);
  });

  it("the session started from a reservation is billed at the players rate", async () => {
    await priceByPlayers();
    const id = await book(PLAYER, D.console1, 5, 65, 4);
    await q(IDS.employeeH1, "select public.confirm_reservation($1)", [id]);
    const [{ check_in_reservation: sessionId }] = await q(IDS.employeeH1, "select public.check_in_reservation($1)", [id]);
    const snap = (await db.query<any>("select rate_per_hour_minor, rate_source from public.session_pricing_snapshots where session_id = $1", [sessionId])).rows[0];
    expect(Number(snap.rate_per_hour_minor)).toBe(800);
    expect(snap.rate_source).toBe("device");
    expect((await db.query<any>("select players_count from public.sessions where id = $1", [sessionId])).rows[0].players_count).toBe(4);
  });

  it("only owners with settings permission can set players rates, and the count is validated", async () => {
    const set = (user: string, scope: string, players: number | null) =>
      q(user, "select public.set_pricing_rate($1, $2, $3, null, 700, $4)", [IDS.h1, scope, D.console1, players]);
    expect((await err(set(IDS.employeeH1, "device", 2))).message).toBe("PERMISSION_DENIED");
    expect((await err(set(IDS.ownerH1H2, "device", 3))).detail).toBe("players");
    expect((await err(set(IDS.ownerH1H2, "hall", 2))).detail).toBe("players");
    await set(IDS.ownerH1H2, "device", 2);
    await set(IDS.ownerH1H2, "device", 2); // update, not a duplicate
    const rows = await q(IDS.ownerH1H2, "select * from public.list_pricing($1) where device_id = $2", [IDS.h1, D.console1]);
    expect(rows).toHaveLength(1);
    expect(rows[0].players_count).toBe(2);
  });
});

describe("staff decisions", () => {
  it("confirm and reject need the permission; a player cannot decide", async () => {
    const a = await book(PLAYER, D.pc1, 120, 180);
    expect((await err(q(PLAYER, "select public.confirm_reservation($1)", [a]))).message).toBe("PERMISSION_DENIED");
    expect((await err(q(IDS.formerEmployeeH1, "select public.confirm_reservation($1)", [a]))).message).toBe("PERMISSION_DENIED");
    await q(IDS.employeeH1, "select public.confirm_reservation($1)", [a]);
    await q(IDS.employeeH1, "select public.confirm_reservation($1)", [a]); // retry-safe
    expect((await status(a)).status).toBe("confirmed");

    const b = await book(PLAYER, D.pc1, 240, 300);
    expect((await err(q(IDS.employeeH1, "select public.reject_reservation($1, '')", [b]))).detail).toBe("reason");
    await q(IDS.employeeH1, "select public.reject_reservation($1, 'Device reserved for a tournament')", [b]);
    expect(await status(b)).toMatchObject({ status: "canceled", cancel_reason: "Device reserved for a tournament" });
    // Rejecting frees the slot again.
    await expect(book(OTHER, D.pc1, 240, 300)).resolves.toBeTruthy();
    // A confirmed reservation cannot be "rejected".
    expect((await err(q(IDS.employeeH1, "select public.reject_reservation($1, 'late')", [a]))).detail).toBe("not_pending");
    expect((await err(q(IDS.ownerH3, "select public.confirm_reservation($1)", [a]))).message).toBe("PERMISSION_DENIED"); // other hall
  });

  it("a pending request cannot be checked in; staff can still cancel it", async () => {
    const a = await book(PLAYER, D.pc1, 5, 65);
    expect((await err(q(IDS.employeeH1, "select public.check_in_reservation($1)", [a]))).detail).toBe("not_checkable");
    await q(IDS.employeeH1, "select public.cancel_reservation($1, 'Customer called')", [a]);
    expect((await status(a)).status).toBe("canceled");
  });

  it("confirming fails when a walk-in took the slot in the meantime", async () => {
    const a = await book(PLAYER, D.pc1, 5, 65);
    await db.query(
      `insert into public.sessions (hall_id, device_id, session_type, scheduled_end_at, guest_name)
       values ($1, $2, 'fixed', now() + interval '2 hours', 'Walk-in')`,
      [IDS.h1, D.pc1],
    );
    expect((await err(q(IDS.employeeH1, "select public.confirm_reservation($1)", [a]))).detail).toBe("device_in_use");
    expect((await status(a)).status).toBe("pending");
  });

  it("unanswered pending requests expire once they start; confirmed no-shows are unchanged", async () => {
    const r = await db.query<any>(
      `insert into public.reservations (hall_id, device_id, customer_id, status, start_at, end_at)
       values ($1, $2, $3, 'pending', now() - interval '10 minutes', now() + interval '50 minutes') returning id`,
      [IDS.h1, D.pc1, PLAYER],
    );
    const n = (await db.query<any>("select public.expire_no_shows() as n")).rows[0].n;
    expect(n).toBe(1);
    expect(await status(r.rows[0].id)).toMatchObject({ status: "canceled", cancel_reason: "not_confirmed" });
  });
});

describe("my bookings", () => {
  it("lists only the caller's bookings with whether they can still be canceled", async () => {
    const far = await book(PLAYER, D.pc1, 300, 360); // well before the 60 min deadline
    const near = await book(PLAYER, D.pc1, 20, 50); // inside the deadline
    await book(OTHER, D.console1, 120, 180);
    const mine = await q(PLAYER, "select * from public.list_my_reservations()");
    expect(mine.map((m) => m.id).sort()).toEqual([far, near].sort());
    const byId = Object.fromEntries(mine.map((m) => [m.id, m]));
    expect(byId[far].can_cancel).toBe(true);
    expect(byId[near].can_cancel).toBe(false);
    expect(byId[far]).toMatchObject({ hall_name: expect.any(String), device_name: "PC-01", status: "pending" });
  });

  it("cancels before the deadline, refuses after it, and never touches another player's booking", async () => {
    const far = await book(PLAYER, D.pc1, 300, 360);
    const near = await book(PLAYER, D.pc1, 20, 50);
    expect((await err(q(OTHER, "select public.cancel_my_reservation($1)", [far]))).message).toBe("NOT_FOUND");
    expect((await err(q(PLAYER, "select public.cancel_my_reservation($1)", [near]))).detail).toBe("past_deadline");
    await q(PLAYER, "select public.cancel_my_reservation($1)", [far]);
    await q(PLAYER, "select public.cancel_my_reservation($1)", [far]); // retry-safe
    expect((await status(far)).status).toBe("canceled");
    expect((await status(near)).status).toBe("pending");
    expect((await audit("reservation.cancel")).length).toBe(1);
  });
});

const audit = async (action: string) =>
  (await db.query<any>("select * from public.audit_logs where action = $1", [action])).rows;
