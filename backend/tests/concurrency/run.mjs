// Real-concurrency checks for reservations and sessions (spec §8.2, §19.2, §24.2).
//
// PGlite (used by `npm test`) has ONE connection, so it cannot test races. This script opens many
// separate connections to a REAL Postgres/Supabase database and fires the same operation at the
// same instant from all of them.
//
// SAFETY: it creates its own hall/devices/users (names prefixed CONC-), and removes them
// afterwards. It refuses to run unless you explicitly name the project it may touch:
//
//   DATABASE_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres' \
//   ALLOW_CONCURRENCY_TEST_ON='<ref>' \
//   node tests/concurrency/run.mjs
//
// Use the "Direct connection" string (or the session-mode pooler), not the transaction pooler.
// Never run it against production. It was written but had NOT been run when this file was added.

import pg from "pg";
import { randomUUID } from "node:crypto";

const { DATABASE_URL, ALLOW_CONCURRENCY_TEST_ON } = process.env;
if (!DATABASE_URL || !ALLOW_CONCURRENCY_TEST_ON) {
  console.error("Set DATABASE_URL and ALLOW_CONCURRENCY_TEST_ON (the project ref you allow this test to modify).");
  process.exit(2);
}
if (!DATABASE_URL.includes(ALLOW_CONCURRENCY_TEST_ON)) {
  console.error("DATABASE_URL does not match ALLOW_CONCURRENCY_TEST_ON. Refusing to run.");
  process.exit(2);
}

const WORKERS = Number(process.env.WORKERS ?? 8);
const ROUNDS = Number(process.env.ROUNDS ?? 5);

const connect = async () => {
  const c = new pg.Client({ connectionString: DATABASE_URL });
  await c.connect();
  return c;
};

const ids = {
  hall: randomUUID(),
  owner: randomUUID(),
  emp: randomUUID(),
};
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failures.push(name);
};

const admin = await connect();

async function setup() {
  await admin.query(
    `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
       ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','conc.owner.${ids.owner}@example.test','{"full_name":"CONC owner"}',now(),now()),
       ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','conc.emp.${ids.emp}@example.test','{"full_name":"CONC emp"}',now(),now())`,
    [ids.owner, ids.emp],
  );
  await admin.query(`insert into public.halls (id, name, time_zone) values ($1,'CONC-TEST hall','UTC')`, [ids.hall]);
  await admin.query(
    `insert into public.hall_memberships (hall_id, user_id, role_key) values ($1,$2,'owner'),($1,$3,'employee')`,
    [ids.hall, ids.owner, ids.emp],
  );
}

async function newDevice(name, withAgent = false) {
  const id = randomUUID();
  await admin.query(
    `insert into public.devices (id, hall_id, name, device_type, capabilities) values ($1,$2,$3,'pc','{}')`,
    [id, ids.hall, name],
  );
  if (withAgent) {
    await admin.query(
      `insert into public.agents (hall_id, device_id, version, last_heartbeat_at) values ($1,$2,'1.0.0',now())`,
      [ids.hall, id],
    );
  }
  return id;
}

/**
 * Opens WORKERS connections, each inside a transaction acting as `user`, waits until all are ready,
 * then runs `call(client, i)` on all of them at the same instant. Returns [{ok, value|error}].
 */
async function race(user, call) {
  const clients = await Promise.all(Array.from({ length: WORKERS }, connect));
  try {
    await Promise.all(
      clients.map(async (c) => {
        await c.query("begin");
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
        await c.query("set local role authenticated");
      }),
    );
    // Barrier: everyone fires together.
    let go;
    const start = new Promise((r) => (go = r));
    const runs = clients.map(async (c, i) => {
      await start;
      try {
        const value = await call(c, i);
        await c.query("commit");
        return { ok: true, value };
      } catch (e) {
        await c.query("rollback").catch(() => {});
        return { ok: false, error: `${e.message}${e.detail ? ":" + e.detail : ""}` };
      }
    });
    go();
    return await Promise.all(runs);
  } finally {
    await Promise.all(clients.map((c) => c.end().catch(() => {})));
  }
}

const count = async (sql, params = []) => Number((await admin.query(sql, params)).rows[0].n);
const day = (n) => new Date(Date.UTC(2027, 0, 1 + n, 10, 0, 0)).toISOString();
const hour = (iso, h) => new Date(Date.parse(iso) + h * 3_600_000).toISOString();

async function main() {
  await setup();

  for (let round = 1; round <= ROUNDS; round++) {
    const tag = `round ${round}/${ROUNDS}`;

    // S1: many staff book overlapping windows on one device -> exactly one wins.
    {
      const dev = await newDevice(`CONC-S1-${round}`);
      const base = day(round);
      const res = await race(ids.emp, (c, i) =>
        c.query(`select public.create_reservation($1,$2,null,$3,$4,$5,$6) as id`, [
          ids.hall, dev, `Racer ${i}`, hour(base, (i % 3) * 0.5), hour(base, 2 + (i % 3) * 0.5), randomUUID(),
        ]),
      );
      const ok = res.filter((r) => r.ok).length;
      const live = await count(`select count(*) n from public.reservations where device_id = $1 and status = 'confirmed'`, [dev]);
      check(`S1 overlapping reservations: exactly one winner (${tag})`, ok === 1 && live === 1, `ok=${ok} rows=${live}`);
      check(`S1 losers get a clean CONFLICT (${tag})`, res.filter((r) => !r.ok).every((r) => r.error.startsWith("CONFLICT")), [...new Set(res.filter((r) => !r.ok).map((r) => r.error))].join(" | "));
    }

    // S2: many walk-ins on one device -> exactly one session.
    {
      const dev = await newDevice(`CONC-S2-${round}`, true);
      const res = await race(ids.emp, (c, i) =>
        c.query(`select public.start_walk_in($1,$2,'open',null,null,$3,$4) as id`, [ids.hall, dev, `Walk ${i}`, randomUUID()]),
      );
      const ok = res.filter((r) => r.ok).length;
      const live = await count(`select count(*) n from public.sessions where device_id = $1 and status = 'in_progress'`, [dev]);
      const cmds = await count(`select count(*) n from public.agent_commands where device_id = $1 and command_type = 'START_SESSION'`, [dev]);
      check(`S2 concurrent walk-ins: one live session and one START_SESSION (${tag})`, ok === 1 && live === 1 && cmds === 1, `ok=${ok} sessions=${live} commands=${cmds}`);
    }

    // S3: the same idempotency key from many connections -> one reservation, same id everywhere.
    {
      const dev = await newDevice(`CONC-S3-${round}`);
      const key = randomUUID();
      const base = day(round + 40);
      const res = await race(ids.emp, (c) =>
        c.query(`select public.create_reservation($1,$2,null,'Idem',$3,$4,$5) as id`, [ids.hall, dev, base, hour(base, 1), key]),
      );
      const idsSeen = new Set(res.filter((r) => r.ok).map((r) => r.value.rows[0].id));
      const rows = await count(`select count(*) n from public.reservations where device_id = $1`, [dev]);
      check(`S3 same idempotency key: one row, one id (${tag})`, rows === 1 && idsSeen.size === 1, `rows=${rows} distinctIds=${idsSeen.size} failures=${res.filter((r) => !r.ok).map((r) => r.error).join("|")}`);
    }

    // S4: a reservation and a walk-in fight for the same slot -> never both.
    {
      const dev = await newDevice(`CONC-S4-${round}`);
      const soon = new Date(Date.now() + 10 * 60_000).toISOString();
      const res = await race(ids.emp, (c, i) =>
        i % 2 === 0
          ? c.query(`select public.create_reservation($1,$2,null,'Booked',$3,$4,$5) as id`, [ids.hall, dev, soon, hour(soon, 1), randomUUID()])
          : c.query(`select public.start_walk_in($1,$2,'fixed',60,null,'Walk',$3) as id`, [ids.hall, dev, randomUUID()]),
      );
      const reservations = await count(`select count(*) n from public.reservations where device_id = $1 and status = 'confirmed'`, [dev]);
      const sessions = await count(`select count(*) n from public.sessions where device_id = $1 and status = 'in_progress'`, [dev]);
      check(`S4 reservation vs walk-in: not both (${tag})`, reservations + sessions === 1, `reservations=${reservations} sessions=${sessions}`);
    }

    // S5: double/multi-click check-in -> one session, one START_SESSION.
    {
      const dev = await newDevice(`CONC-S5-${round}`, true);
      const start = new Date(Date.now() - 2 * 60_000).toISOString();
      const rid = (
        await admin.query(
          `insert into public.reservations (hall_id, device_id, guest_name, start_at, end_at) values ($1,$2,'Check-in',$3,$4) returning id`,
          [ids.hall, dev, start, hour(start, 1)],
        )
      ).rows[0].id;
      const res = await race(ids.emp, (c) => c.query(`select public.check_in_reservation($1) as id`, [rid]));
      const sessionIds = new Set(res.filter((r) => r.ok).map((r) => r.value.rows[0].id));
      const sessions = await count(`select count(*) n from public.sessions where reservation_id = $1`, [rid]);
      const cmds = await count(`select count(*) n from public.agent_commands where device_id = $1 and command_type = 'START_SESSION'`, [dev]);
      check(`S5 concurrent check-in: one session, one command (${tag})`, sessions === 1 && cmds === 1 && sessionIds.size === 1, `sessions=${sessions} commands=${cmds} distinctIds=${sessionIds.size} errors=${res.filter((r) => !r.ok).map((r) => r.error).join("|")}`);
    }

    // S6: concurrent extend with the same key -> extended once.
    {
      const dev = await newDevice(`CONC-S6-${round}`);
      // Create the running session directly (as the database owner) so only extend/end are raced.
      const sessionId = (
        await admin.query(
          `insert into public.sessions (hall_id, device_id, guest_name, session_type, scheduled_end_at, started_by)
           values ($1,$2,'Ext','fixed', now() + interval '30 minutes', $3) returning id`,
          [ids.hall, dev, ids.emp],
        )
      ).rows[0].id;
      if (!sessionId) {
        check(`S6 setup (${tag})`, false, "could not create session");
      } else {
        const key = randomUUID();
        const res = await race(ids.emp, (c) => c.query(`select public.extend_session($1, 15, 'Race', $2) as e`, [sessionId, key]));
        const ext = await count(`select extension_count n from public.sessions where id = $1`, [sessionId]);
        check(`S6 same-key extend from many connections: extended once (${tag})`, ext === 1, `extension_count=${ext} errors=${res.filter((r) => !r.ok).map((r) => r.error).join("|")}`);

        // S7: concurrent end -> one END_SESSION command, same duration for everyone.
        const ends = await race(ids.emp, (c) => c.query(`select public.end_session($1,'normal',null) as s`, [sessionId]));
        const durations = new Set(ends.filter((r) => r.ok).map((r) => r.value.rows[0].s));
        const status = (await admin.query(`select status from public.sessions where id = $1`, [sessionId])).rows[0].status;
        check(`S7 concurrent end: ended once, one duration (${tag})`, status === "completed" && durations.size === 1, `status=${status} durations=${durations.size} errors=${ends.filter((r) => !r.ok).map((r) => r.error).join("|")}`);
      }
    }
  }
}

async function cleanup() {
  // audit_logs is append-only; remove only this test's rows with the trigger temporarily disabled.
  await admin.query("begin");
  await admin.query("alter table public.audit_logs disable trigger audit_logs_no_update_delete");
  await admin.query("delete from public.audit_logs where hall_id = $1", [ids.hall]);
  await admin.query("alter table public.audit_logs enable trigger audit_logs_no_update_delete");
  await admin.query("delete from public.sessions where hall_id = $1", [ids.hall]);
  await admin.query("delete from public.reservations where hall_id = $1", [ids.hall]);
  await admin.query("delete from public.agent_commands where hall_id = $1", [ids.hall]);
  await admin.query("delete from public.agents where hall_id = $1", [ids.hall]);
  await admin.query("delete from public.device_maintenance where hall_id = $1", [ids.hall]);
  await admin.query("delete from public.devices where hall_id = $1", [ids.hall]);
  await admin.query("delete from public.hall_memberships where hall_id = $1", [ids.hall]);
  await admin.query("delete from public.halls where id = $1", [ids.hall]);
  await admin.query("delete from auth.users where id = any($1)", [[ids.owner, ids.emp]]);
  await admin.query("commit");
}

try {
  await main();
} catch (e) {
  console.error("Unexpected error:", e);
  failures.push("unexpected error");
} finally {
  try {
    await cleanup();
    console.log("Cleanup done.");
  } catch (e) {
    console.error("CLEANUP FAILED, remove rows with hall name 'CONC-TEST hall' by hand:", e.message);
    await admin.query("rollback").catch(() => {});
  }
  await admin.end();
}

console.log(failures.length === 0 ? "\nAll concurrency checks passed." : `\n${failures.length} check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
