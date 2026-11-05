import type { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

const PC1 = "44444444-0000-0000-0000-000000000001"; // hall 1, agent exists
const CONSOLE = "44444444-0000-0000-0000-000000000003";
const H3PC = "44444444-0000-0000-0000-000000000004"; // hall 3

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const key = () => crypto.randomUUID();

/** Runs as an app user (authenticated) the way PostgREST does. */
async function asUser<T>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
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

/** Runs as the Edge Function does: service_role. */
async function bridge<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec("begin");
  try {
    await db.exec("set local role service_role");
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

const owner = IDS.ownerH1H2;

async function newCode(kind: "agent" | "hall_server", hall = IDS.h1): Promise<string> {
  const r = await asUser<{ pairing_code: string }>(owner, "select * from public.create_pairing_code($1, $2)", [hall, kind]);
  return r[0].pairing_code;
}

async function newServer(): Promise<{ id: string; hash: string }> {
  const token = key();
  const hash = sha(token);
  await bridge("select public.bridge_redeem_hall_server_code($1, 'Cashier', $2)", [await newCode("hall_server"), hash]);
  const [row] = await bridge<{ hall_server_id: string }>("select * from public.bridge_authenticate($1)", [hash]);
  return { id: row.hall_server_id, hash };
}

describe("pairing codes", () => {
  it("only a manager of the hall can create one, and it is audited", async () => {
    expect((await err(asUser(IDS.customerOnly, "select * from public.create_pairing_code($1, 'agent')", [IDS.h1]))).message).toBe("PERMISSION_DENIED");
    expect((await err(asUser(owner, "select * from public.create_pairing_code($1, 'agent')", [IDS.h3]))).message).toBe("PERMISSION_DENIED");
    expect((await err(asUser(owner, "select * from public.create_pairing_code($1, 'nope')", [IDS.h1]))).message).toBe("VALIDATION");
    const code = await newCode("agent");
    expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const a = await db.query<any>("select * from public.audit_logs where action = 'pairing.code.create' and hall_id = $1", [IDS.h1]);
    expect(a.rows.length).toBeGreaterThan(0);
  });

  it("stores only a hash, never the code, and clients cannot read the table", async () => {
    const code = await newCode("agent");
    const raw = code.replace(/-/g, "");
    const rows = await db.query<any>("select code_hash from public.pairing_codes");
    expect(rows.rows.some((r) => r.code_hash === sha(raw))).toBe(true);
    expect(JSON.stringify(rows.rows)).not.toContain(raw);
    expect((await err(asUser(owner, "select * from public.pairing_codes"))).message).toMatch(/permission denied/i);
  });

  it("a newer code of the same kind supersedes the older one", async () => {
    const older = await newCode("hall_server");
    await newCode("hall_server");
    const e = await err(bridge("select public.bridge_redeem_hall_server_code($1, 'x', $2)", [older, sha(key())]));
    expect(e.message).toBe("NOT_FOUND");
  });
});

describe("hall server pairing", () => {
  it("redeems a code once, stores only the token hash and returns the hall", async () => {
    const code = await newCode("hall_server");
    const hash = sha(key());
    const [r] = await bridge<any>("select public.bridge_redeem_hall_server_code($1, 'Cashier PC', $2) as hall", [code, hash]);
    expect(r.hall).toBe(IDS.h1);
    expect((await err(bridge("select public.bridge_redeem_hall_server_code($1, 'again', $2)", [code, sha(key())]))).message).toBe("NOT_FOUND");
    const stored = await db.query<any>("select token_hash, name from public.hall_servers where token_hash = $1", [hash]);
    expect(stored.rows).toHaveLength(1);
  });

  it("rejects an expired code, a code of the wrong kind and a malformed token hash", async () => {
    const expired = await newCode("hall_server");
    await db.exec("update public.pairing_codes set expires_at = now() - interval '1 second' where used_at is null and kind = 'hall_server'");
    expect((await err(bridge("select public.bridge_redeem_hall_server_code($1, 'x', $2)", [expired, sha(key())]))).message).toBe("NOT_FOUND");
    const agentCode = await newCode("agent");
    expect((await err(bridge("select public.bridge_redeem_hall_server_code($1, 'x', $2)", [agentCode, sha(key())]))).message).toBe("NOT_FOUND");
    const ok = await newCode("hall_server");
    expect((await err(bridge("select public.bridge_redeem_hall_server_code($1, 'x', 'short')", [ok]))).message).toBe("VALIDATION");
  });

  it("authenticates a valid token and refuses unknown and revoked ones", async () => {
    const s = await newServer();
    expect(await bridge("select * from public.bridge_authenticate($1)", [s.hash])).toHaveLength(1);
    expect(await bridge("select * from public.bridge_authenticate($1)", [sha("nope")])).toHaveLength(0);
    expect((await err(asUser(IDS.customerOnly, "select public.revoke_hall_server($1)", [s.id]))).message).toBe("PERMISSION_DENIED");
    await asUser(owner, "select public.revoke_hall_server($1)", [s.id]);
    expect(await bridge("select * from public.bridge_authenticate($1)", [s.hash])).toHaveLength(0);
  });

  it("the owner sees servers without the token hash", async () => {
    await newServer();
    const rows = await asUser<any>(owner, "select id, name, last_seen_at from public.hall_servers");
    expect(rows.length).toBeGreaterThan(0);
    expect((await err(asUser(owner, "select token_hash from public.hall_servers"))).message).toMatch(/permission denied/i);
  });
});

describe("agent pairing", () => {
  it("pairs an active PC of the server's own hall and creates the agent row", async () => {
    const s = await newServer();
    await db.exec(`delete from public.agents where device_id = '${PC1}'`);
    const code = await newCode("agent");
    const [r] = await bridge<any>("select public.bridge_redeem_agent_code($1, $2, $3, $4) as hall", [IDS.h1, s.id, code, PC1]);
    expect(r.hall).toBe(IDS.h1);
    const a = await db.query<any>("select paired_at, hall_server_id from public.agents where device_id = $1", [PC1]);
    expect(a.rows[0].hall_server_id).toBe(s.id);
    expect(a.rows[0].paired_at).not.toBeNull();
    // one-time
    expect((await err(bridge("select public.bridge_redeem_agent_code($1, $2, $3, $4)", [IDS.h1, s.id, code, PC1]))).message).toBe("NOT_FOUND");
  });

  it("refuses a console, another hall's device, a wrong-kind code and a revoked server", async () => {
    const s = await newServer();
    expect((await err(bridge("select public.bridge_redeem_agent_code($1, $2, $3, $4)", [IDS.h1, s.id, await newCode("agent"), CONSOLE]))).message).toBe("PRECONDITION_FAILED");
    expect((await err(bridge("select public.bridge_redeem_agent_code($1, $2, $3, $4)", [IDS.h1, s.id, await newCode("agent"), H3PC]))).message).toBe("PRECONDITION_FAILED");
    expect((await err(bridge("select public.bridge_redeem_agent_code($1, $2, $3, $4)", [IDS.h1, s.id, await newCode("hall_server"), PC1]))).message).toBe("NOT_FOUND");
    await asUser(owner, "select public.revoke_hall_server($1)", [s.id]);
    expect((await err(bridge("select public.bridge_redeem_agent_code($1, $2, $3, $4)", [IDS.h1, s.id, await newCode("agent"), PC1]))).message).toBe("PERMISSION_DENIED");
  });

  it("a code of hall 1 cannot pair through a server of another hall", async () => {
    const s = await newServer(); // hall 1
    const code = await newCode("agent"); // hall 1
    expect((await err(bridge("select public.bridge_redeem_agent_code($1, $2, $3, $4)", [IDS.h3, s.id, code, H3PC]))).message).toBe("PERMISSION_DENIED");
  });
});

describe("durable pull", () => {
  async function drain() {
    const [r] = await bridge<any>("select public.bridge_pull_commands($1, 0, 200) as r", [IDS.h1]);
    return r.r;
  }

  it("a staff command comes through in the wire format, in order, once per cursor", async () => {
    await drain();
    const id1 = (await asUser<any>(IDS.ownerH1H2, "select public.request_device_command($1, 'LOCK', $2) as id", [PC1, key()]))[0].id;
    const id2 = (await asUser<any>(IDS.ownerH1H2, "select public.request_device_command($1, 'RESTART', $2) as id", [PC1, key()]))[0].id;

    const first = await drain();
    const mine = first.commands.filter((c: any) => [id1, id2].includes(c.commandId));
    expect(mine.map((c: any) => c.type)).toEqual(["LOCK", "RESTART"]);
    expect(mine[0]).toMatchObject({ hallId: IDS.h1, stationId: PC1, idempotencyKey: id1, payload: { reason: "staff" } });
    expect(mine[1].payload).toMatchObject({ graceSeconds: 30 });

    const [again] = await bridge<any>("select public.bridge_pull_commands($1, $2, 200) as r", [IDS.h1, first.cursor]);
    expect(again.r.commands).toHaveLength(0);
    expect(again.r.cursor).toBe(first.cursor);
  });

  it("never returns another hall's commands", async () => {
    await asUser(IDS.ownerH1H2, "select public.request_device_command($1, 'LOCK', $2)", [PC1, key()]);
    const [r] = await bridge<any>("select public.bridge_pull_commands($1, 0, 200) as r", [IDS.h3]);
    expect(r.r.commands.every((c: any) => c.hallId === IDS.h3)).toBe(true);
  });

  it("builds session payloads from the live session and translates SYNC_STATE and late START", async () => {
    await drain();
    const dev = "44444444-0000-0000-0000-0000000000a1";
    await db.exec(`insert into public.devices (id, hall_id, name, device_type, capabilities) values ('${dev}', '${IDS.h1}', 'PC-S', 'pc', array['lock','unlock'])`);
    await db.exec(`insert into public.agents (hall_id, device_id, sync_state) values ('${IDS.h1}', '${dev}', 'unknown')`);
    const live = (await db.query<any>(
      `insert into public.sessions (hall_id, device_id, session_type, status, started_at, scheduled_end_at)
       values ('${IDS.h1}', '${dev}', 'fixed', 'in_progress', now() - interval '10 minutes', now() + interval '50 minutes') returning id`)).rows[0].id;

    await db.exec(`insert into public.agent_commands (hall_id, device_id, session_id, command_type) values
      ('${IDS.h1}', '${dev}', '${live}', 'START_SESSION'), ('${IDS.h1}', '${dev}', '${live}', 'SYNC_STATE')`);
    const r1 = await drain();
    const mine = r1.commands.filter((c: any) => c.stationId === dev);
    expect(mine.map((c: any) => c.type)).toEqual(["START_SESSION", "EXTEND_SESSION"]);
    expect(mine[0].payload).toMatchObject({ sessionId: live, sessionRevision: 0, durationMs: 3_600_000 });
    expect(Date.parse(mine[0].payload.endAtUtc)).toBeGreaterThan(Date.now());

    // the session ends before the START was ever delivered: it must NOT unlock the PC
    await db.exec(`update public.sessions set status = 'completed', ended_at = now(), end_type = 'normal' where id = '${live}'`);
    await db.exec(`insert into public.agent_commands (hall_id, device_id, session_id, command_type) values
      ('${IDS.h1}', '${dev}', '${live}', 'START_SESSION'), ('${IDS.h1}', '${dev}', '${live}', 'SYNC_STATE')`);
    const r2 = await drain();
    const late = r2.commands.filter((c: any) => c.stationId === dev && c.commandId !== mine[0].commandId && c.commandId !== mine[1].commandId);
    expect(late.map((c: any) => c.type)).toEqual(["END_SESSION", "END_SESSION"]);
  });

  it("an open (no end time) session is sent with a zero duration and no end", async () => {
    const dev = "44444444-0000-0000-0000-0000000000a2";
    await db.exec(`insert into public.devices (id, hall_id, name, device_type, capabilities) values ('${dev}', '${IDS.h1}', 'PC-O', 'pc', '{}')`);
    await db.exec(`insert into public.agents (hall_id, device_id, sync_state) values ('${IDS.h1}', '${dev}', 'unknown')`);
    const sid = (await db.query<any>(
      `insert into public.sessions (hall_id, device_id, session_type, status) values ('${IDS.h1}', '${dev}', 'open', 'in_progress') returning id`)).rows[0].id;
    await db.exec(`insert into public.agent_commands (hall_id, device_id, session_id, command_type) values ('${IDS.h1}', '${dev}', '${sid}', 'START_SESSION')`);
    const r = await drain();
    const c = r.commands.find((x: any) => x.stationId === dev);
    expect(c.payload.durationMs).toBe(0);
    expect(c.payload.endAtUtc).toBeNull();
  });

  it("stale commands are expired instead of delivered late, with an event", async () => {
    await drain();
    const id = (await asUser<any>(IDS.ownerH1H2, "select public.request_device_command($1, 'SHUTDOWN', $2) as id", [PC1, key()]))[0].id;
    await db.exec(`update public.agent_commands set created_at = now() - interval '6 minutes' where id = '${id}'`);
    const r = await drain();
    expect(r.commands.find((c: any) => c.commandId === id)).toBeUndefined();
    const st = await db.query<any>("select status from public.agent_commands where id = $1", [id]);
    expect(st.rows[0].status).toBe("Expired");
    const ev = await db.query<any>("select status from public.agent_command_events where command_id = $1 order by created_at, id", [id]);
    expect(ev.rows.map((e) => e.status)).toContain("Expired");
  });
});

describe("report and heartbeat", () => {
  async function queued(type = "LOCK") {
    return (await asUser<any>(IDS.ownerH1H2, "select public.request_device_command($1, $2, $3) as id", [PC1, type, key()]))[0].id as string;
  }
  const report = async (id: string, status: string, result: unknown = null, error: string | null = null, hall = IDS.h1) =>
    (await bridge<any>("select public.bridge_report_command($1, $2, $3, $4::jsonb, $5) as ok", [hall, id, status, result === null ? null : JSON.stringify(result), error]))[0].ok as boolean;

  it("moves forward, never backwards, never out of a terminal state, and duplicates are no-ops", async () => {
    const id = await queued();
    expect(await report(id, "Sent")).toBe(true);
    expect(await report(id, "Sent")).toBe(false);
    expect(await report(id, "Acknowledged")).toBe(true);
    expect(await report(id, "Sent")).toBe(false);
    expect(await report(id, "Executed", { status: "Executed" })).toBe(true);
    expect(await report(id, "Failed")).toBe(false);
    expect(await report(id, "Executed")).toBe(false);
    const c = (await db.query<any>("select status, response from public.agent_commands where id = $1", [id])).rows[0];
    expect(c.status).toBe("Executed");
    expect(c.response).toEqual({ status: "Executed" });
    const ev = (await db.query<any>("select status from public.agent_command_events where command_id = $1", [id])).rows.map((e) => e.status);
    expect(ev.filter((s) => s === "Executed")).toHaveLength(1);
  });

  it("Executed stamps the agent, Failed records the error", async () => {
    const ok = await queued();
    await report(ok, "Executed");
    const a = (await db.query<any>("select last_success_command_at, last_error from public.agents where device_id = $1", [PC1])).rows[0];
    expect(a.last_success_command_at).not.toBeNull();
    expect(a.last_error).toBeNull();
    const bad = await queued("RESTART");
    await report(bad, "Failed", { failureReason: "POWER_DENIED" }, "denied");
    const a2 = (await db.query<any>("select last_error from public.agents where device_id = $1", [PC1])).rows[0];
    expect(a2.last_error).toBe("denied");
  });

  it("cannot touch another hall's command and rejects unknown statuses", async () => {
    const id = await queued();
    expect(await report(id, "Executed", null, null, IDS.h3)).toBe(false);
    expect((await db.query<any>("select status from public.agent_commands where id = $1", [id])).rows[0].status).toBe("Queued");
    expect((await err(report(id, "Queued"))).message).toBe("VALIDATION");
    expect((await err(report(id, "Bogus"))).message).toBe("VALIDATION");
  });

  it("heartbeats mark the agent online with the cloud's clock, only inside the hall", async () => {
    await db.exec(`update public.agents set last_heartbeat_at = now() - interval '1 hour' where device_id in ('${PC1}', '${H3PC}')`);
    const [r] = await bridge<any>("select public.bridge_heartbeat_batch($1, $2::jsonb) as n", [IDS.h1, JSON.stringify([
      { stationId: PC1, version: "0.1", observedAt: "2099-01-01T00:00:00Z", session: "Active", reliability: "Trusted" },
      { stationId: H3PC, version: "evil" },
      { stationId: "99999999-0000-0000-0000-000000000000" },
    ])]);
    expect(r.n).toBe(1);
    const a = (await db.query<any>("select last_heartbeat_at, version, sync_state from public.agents where device_id = $1", [PC1])).rows[0];
    expect(new Date(a.last_heartbeat_at).getTime()).toBeLessThan(Date.now() + 5000); // never the PC-supplied future time
    expect(a.version).toBe("0.1");
    expect(a.sync_state).toBe("synced");
    const other = (await db.query<any>("select version, last_heartbeat_at from public.agents where device_id = $1", [H3PC])).rows[0];
    expect(other.version).not.toBe("evil");
    const view = (await db.query<any>("select agent_status from public.v_device_live_status where device_id = $1", [PC1])).rows[0];
    expect(view.agent_status).toBe("online");
  });

  it("an unknown session or uncertain time marks the agent out of sync; oversized batches are refused", async () => {
    await bridge("select public.bridge_heartbeat_batch($1, $2::jsonb)", [IDS.h1, JSON.stringify([{ stationId: PC1, session: "Unknown" }])]);
    expect((await db.query<any>("select sync_state from public.agents where device_id = $1", [PC1])).rows[0].sync_state).toBe("out_of_sync");
    await bridge("select public.bridge_heartbeat_batch($1, $2::jsonb)", [IDS.h1, JSON.stringify([{ stationId: PC1, session: "Active", reliability: "Uncertain" }])]);
    expect((await db.query<any>("select sync_state from public.agents where device_id = $1", [PC1])).rows[0].sync_state).toBe("out_of_sync");
    const big = JSON.stringify(Array.from({ length: 501 }, () => ({ stationId: PC1 })));
    expect((await err(bridge("select public.bridge_heartbeat_batch($1, $2::jsonb)", [IDS.h1, big]))).message).toBe("VALIDATION");
    expect((await err(bridge("select public.bridge_heartbeat_batch($1, '{}'::jsonb)", [IDS.h1]))).message).toBe("VALIDATION");
  });
});

describe("privileges", () => {
  it("clients cannot call any bridge function; owners can call the two owner RPCs", async () => {
    for (const sig of [
      "public.bridge_authenticate(text,text)",
      "public.bridge_redeem_hall_server_code(text,text,text)",
      "public.bridge_redeem_agent_code(uuid,uuid,text,uuid)",
      "public.bridge_pull_commands(uuid,bigint,int)",
      "public.bridge_report_command(uuid,uuid,text,jsonb,text)",
      "public.bridge_heartbeat_batch(uuid,jsonb)",
    ]) {
      const r = await db.query<any>("select has_function_privilege('authenticated', $1, 'execute') a, has_function_privilege('anon', $1, 'execute') b, has_function_privilege('service_role', $1, 'execute') c", [sig]);
      expect(r.rows[0], sig).toEqual({ a: false, b: false, c: true });
    }
    for (const sig of ["public.create_pairing_code(uuid,text)", "public.revoke_hall_server(uuid)"]) {
      const r = await db.query<any>("select has_function_privilege('authenticated', $1, 'execute') a, has_function_privilege('anon', $1, 'execute') b", [sig]);
      expect(r.rows[0], sig).toEqual({ a: true, b: false });
    }
  });

  it("an authenticated user cannot call a bridge function through PostgREST-style access", async () => {
    const e = await err(asUser(owner, "select public.bridge_pull_commands($1, 0, 10)", [IDS.h1]));
    expect(e.message).toMatch(/permission denied/i);
  });
});
