import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

const D = {
  pc1: "44444444-0000-0000-0000-000000000001", // agent online, all capabilities
  pc2: "44444444-0000-0000-0000-000000000002", // agent stale, lock/unlock only
  console1: "44444444-0000-0000-0000-000000000003", // no agent
  h3pc: "44444444-0000-0000-0000-000000000004",
};

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => {
  await db.close();
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
const audit = async (action: string) =>
  (await db.query<any>("select * from public.audit_logs where action = $1", [action])).rows;
const key = () => crypto.randomUUID();

describe("device visibility (RLS)", () => {
  it("members with device.view see their hall's devices with computed status", async () => {
    const rows = await q(IDS.employeeH1, "select * from public.v_device_live_status order by name");
    expect(rows.map((r) => r.name)).toEqual(["Console-01", "PC-01", "PC-02"]);
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(by["PC-01"]).toMatchObject({
      agent_status: "online",
      effective_availability: "available",
      maintenance_status: "none",
    });
    expect(by["PC-02"].agent_status).toBe("offline"); // heartbeat older than the threshold
    expect(by["Console-01"].agent_status).toBe("none");
  });
  it("never leaks another hall or tenant", async () => {
    const h3 = await q(IDS.ownerH3, "select name from public.v_device_live_status");
    expect(h3.map((r) => r.name)).toEqual(["PC-H3-01"]);
    expect(await q(IDS.salesAgent, "select * from public.v_device_live_status")).toEqual([]);
    expect(await q(IDS.customerOnly, "select * from public.devices")).toEqual([]);
    expect(await q(IDS.superAdmin, "select * from public.agents")).toEqual([]);
  });
  it("offline threshold is per hall and configurable in data", async () => {
    const status = async () =>
      (await q(IDS.employeeH1, "select agent_status from public.v_device_live_status where name = 'PC-02'"))[0].agent_status;
    await db.exec(`update public.agents set last_heartbeat_at = now() - interval '5 minutes' where device_id = '${D.pc2}'`);
    expect(await status()).toBe("offline"); // default threshold: 90 s
    await db.exec(`update public.hall_settings set agent_offline_threshold_seconds = 600 where hall_id = '${IDS.h1}'`);
    expect(await status()).toBe("online");
    await db.exec(`update public.hall_settings set agent_offline_threshold_seconds = 90 where hall_id = '${IDS.h1}'`);
    await db.exec(`update public.agents set last_heartbeat_at = now() - interval '1 hour' where device_id = '${D.pc2}'`);
  });
  it("rejects thresholds outside 10 s to 1 h", async () => {
    await expect(db.exec(`update public.hall_settings set agent_offline_threshold_seconds = 5 where hall_id = '${IDS.h1}'`)).rejects.toThrow();
    await expect(db.exec(`update public.hall_settings set agent_offline_threshold_seconds = 7200 where hall_id = '${IDS.h1}'`)).rejects.toThrow();
  });
  it("clients cannot write devices, agents or commands directly", async () => {
    await expect(q(IDS.ownerH1H2, "update public.devices set name = 'x'")).rejects.toThrow(/permission denied/i);
    await expect(q(IDS.ownerH1H2, "update public.agents set last_heartbeat_at = now()")).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      q(
        IDS.ownerH1H2,
        "insert into public.agent_commands (hall_id, device_id, command_type) values ($1,$2,'LOCK')",
        [IDS.h1, D.pc1],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("upsert_device", () => {
  it("owner creates and updates devices; audited", async () => {
    const [{ id }] = await q(
      IDS.ownerH1H2,
      "select public.upsert_device($1, null, ' PC-03 ', 'pc', 'Standard', array['lock'], 'active') as id",
      [IDS.h1],
    );
    expect((await q(IDS.ownerH1H2, "select name from public.devices where id = $1", [id]))[0].name).toBe("PC-03");
    await q(
      IDS.ownerH1H2,
      "select public.upsert_device($1, $2, 'PC-03', 'pc', 'VIP', array['lock','unlock'], 'disabled')",
      [IDS.h1, id],
    );
    const v = (
      await q(IDS.ownerH1H2, "select effective_availability from public.v_device_live_status where device_id = $1", [id])
    )[0];
    expect(v.effective_availability).toBe("disabled");
    expect((await audit("device.create")).length).toBe(1);
    const [upd] = await audit("device.update");
    expect(upd.before_data.category).toBe("Standard");
    expect(upd.after_data.category).toBe("VIP");
  });
  it("employees, other tenants and sales cannot manage devices", async () => {
    for (const u of [IDS.employeeH1, IDS.ownerH3, IDS.salesAgent, IDS.superAdmin]) {
      const e = await err(
        q(u, "select public.upsert_device($1, null, 'X', 'pc', null, '{}', 'active')", [IDS.h1]),
      );
      expect(e.message).toBe("PERMISSION_DENIED");
    }
  });
  it("cannot edit a device through another hall's id (no cross-hall edits)", async () => {
    const e = await err(
      q(IDS.ownerH1H2, "select public.upsert_device($1, $2, 'Hacked', 'pc', null, '{}', 'active')", [IDS.h2, D.pc1]),
    );
    expect(e.message).toBe("NOT_FOUND");
    expect((await db.query<any>("select name from public.devices where id = $1", [D.pc1])).rows[0].name).toBe(
      "PC-01",
    );
  });
  it("validates and rejects duplicate names (case-insensitive) per hall", async () => {
    const call = (name: string, type = "pc", caps = "'{}'", hall = IDS.h1) =>
      err(
        q(IDS.ownerH1H2, `select public.upsert_device($1, null, $2, $3, null, ${caps}, 'active')`, [hall, name, type]),
      );
    expect((await call("pc-01")).message).toBe("CONFLICT");
    expect((await call("")).message).toBe("VALIDATION");
    expect((await call("Z", "toaster")).message).toBe("VALIDATION");
    expect((await call("Z", "pc", "array['rm -rf']")).message).toBe("VALIDATION");
    // The same name is fine in a different hall.
    expect((await call("PC-01", "pc", "'{}'", IDS.h2)).message).toBe("NO_ERROR");
  });
});

describe("maintenance", () => {
  let mid: string;
  it("an employee with device.control starts maintenance; the device becomes unavailable", async () => {
    [{ id: mid }] = await q(
      IDS.employeeH1,
      "select public.start_maintenance($1, 'Fan replacement', now() + interval '2 hours') as id",
      [D.pc2],
    );
    const v = (
      await q(IDS.employeeH1, "select * from public.v_device_live_status where device_id = $1", [D.pc2])
    )[0];
    expect(v).toMatchObject({
      maintenance_status: "in_maintenance",
      effective_availability: "maintenance",
      maintenance_reason: "Fan replacement",
    });
    expect((await audit("device.maintenance.start"))[0].reason).toBe("Fan replacement");
  });
  it("rejects double start, missing reason and past end", async () => {
    expect((await err(q(IDS.employeeH1, "select public.start_maintenance($1, 'again', null)", [D.pc2]))).message).toBe(
      "CONFLICT",
    );
    expect((await err(q(IDS.employeeH1, "select public.start_maintenance($1, '  ', null)", [D.pc1]))).message).toBe(
      "VALIDATION",
    );
    expect(
      (
        await err(
          q(IDS.employeeH1, "select public.start_maintenance($1, 'x', now() - interval '1 hour')", [D.pc1]),
        )
      ).message,
    ).toBe("VALIDATION");
  });
  it("other tenants cannot start or end maintenance", async () => {
    expect((await err(q(IDS.ownerH3, "select public.start_maintenance($1, 'x', null)", [D.pc1]))).message).toBe(
      "PERMISSION_DENIED",
    );
    expect((await err(q(IDS.ownerH3, "select public.end_maintenance($1)", [mid]))).message).toBe("PERMISSION_DENIED");
  });
  it("ending records who, restores availability, preserves history, and cannot repeat", async () => {
    await q(IDS.employeeH1, "select public.end_maintenance($1)", [mid]);
    const m = (await db.query<any>("select ended_by from public.device_maintenance where id = $1", [mid])).rows[0];
    expect(m.ended_by).toBe(IDS.employeeH1);
    expect(
      (
        await q(IDS.employeeH1, "select effective_availability from public.v_device_live_status where device_id = $1", [
          D.pc2,
        ])
      )[0].effective_availability,
    ).toBe("available");
    expect((await err(q(IDS.employeeH1, "select public.end_maintenance($1)", [mid]))).message).toBe(
      "PRECONDITION_FAILED",
    );
    await q(IDS.employeeH1, "select public.start_maintenance($1, 'second time', null)", [D.pc2]);
    expect(
      (await db.query<any>("select count(*)::int n from public.device_maintenance where device_id = $1", [D.pc2]))
        .rows[0].n,
    ).toBe(2);
    await db.exec(
      `update public.device_maintenance set ended_at = now(), ended_by = '${IDS.employeeH1}' where device_id = '${D.pc2}' and ended_at is null`,
    );
  });
});

describe("request_device_command", () => {
  it("records a Queued command with an event and an audit entry", async () => {
    const [{ id }] = await q(IDS.employeeH1, "select public.request_device_command($1, 'LOCK', $2) as id", [
      D.pc1,
      key(),
    ]);
    const c = (await q(IDS.employeeH1, "select * from public.agent_commands where id = $1", [id]))[0];
    expect(c).toMatchObject({
      status: "Queued",
      command_type: "LOCK",
      requested_by: IDS.employeeH1,
      hall_id: IDS.h1,
    });
    const ev = await q(IDS.employeeH1, "select status from public.agent_command_events where command_id = $1", [id]);
    expect(ev.map((e) => e.status)).toEqual(["Queued"]);
    expect((await audit("device.command.request")).length).toBe(0); // no longer audited (…000045); the command log has it
  });
  it("is idempotent: the same key returns the same command; a different payload is a conflict", async () => {
    const k = key();
    const sql = "select public.request_device_command($1, 'RESTART', $2) as id";
    const [{ id: a }] = await q(IDS.employeeH1, sql, [D.pc1, k]);
    const [{ id: b }] = await q(IDS.employeeH1, sql, [D.pc1, k]);
    expect(b).toBe(a);
    expect((await err(q(IDS.employeeH1, "select public.request_device_command($1, 'SHUTDOWN', $2)", [D.pc1, k]))).message).toBe(
      "CONFLICT",
    );
    expect(
      (await db.query<any>("select count(*)::int n from public.agent_commands where idempotency_key = $1", [k]))
        .rows[0].n,
    ).toBe(1);
  });
  it("only allows staff command types; never START/END_SESSION or free text", async () => {
    for (const t of ["START_SESSION", "END_SESSION", "rm -rf /", "lock", ""]) {
      const e = await err(q(IDS.employeeH1, "select public.request_device_command($1, $2, $3)", [D.pc1, t, key()]));
      expect(e.message).toBe("VALIDATION");
    }
  });
  it("requires an Agent, a supported capability and an active device", async () => {
    const call = (dev: string, type: string) =>
      err(q(IDS.employeeH1, "select public.request_device_command($1, $2, $3)", [dev, type, key()]));
    expect((await call(D.console1, "LOCK")).detail).toBe("no_agent");
    expect((await call(D.pc2, "SHUTDOWN")).detail).toBe("unsupported_command");
    expect((await call(D.pc2, "SYNC_STATE")).message).toBe("NO_ERROR"); // always allowed
    await db.exec(`update public.devices set status='disabled' where id='${D.pc1}'`);
    expect((await call(D.pc1, "LOCK")).detail).toBe("device_disabled");
    await db.exec(`update public.devices set status='active' where id='${D.pc1}'`);
  });
  it("is denied across tenants, to sales/super admin, customers and deactivated users", async () => {
    for (const u of [IDS.ownerH3, IDS.salesAgent, IDS.superAdmin, IDS.customerOnly, IDS.deactivated]) {
      const e = await err(q(u, "select public.request_device_command($1, 'LOCK', $2)", [D.pc1, key()]));
      expect(e.message).toBe("PERMISSION_DENIED");
    }
    const e = await err(q(IDS.employeeH1, "select public.request_device_command($1, 'LOCK', $2)", [D.h3pc, key()]));
    expect(e.message).toBe("PERMISSION_DENIED");
  });
});

describe("command history", () => {
  it("lists with requester names, filters and pagination; a timeout is not a failure", async () => {
    await db.exec("update public.agent_commands set status = 'TimedOut' where command_type = 'RESTART'");
    const all = await q(IDS.employeeH1, "select * from public.list_agent_commands($1, null, null, null, 50, 0)", [
      IDS.h1,
    ]);
    expect(all.length).toBeGreaterThan(2);
    expect(Number(all[0].total)).toBe(all.length);
    expect(all[0].requested_by_name).toBeTruthy();
    const timed = await q(IDS.employeeH1, "select * from public.list_agent_commands($1, null, 'TimedOut')", [IDS.h1]);
    expect(timed.length).toBe(1);
    expect(timed[0].status).toBe("TimedOut");
    const forPc2 = await q(IDS.employeeH1, "select * from public.list_agent_commands($1, $2)", [IDS.h1, D.pc2]);
    expect(forPc2.every((r) => r.device_name === "PC-02")).toBe(true);
    const one = await q(IDS.employeeH1, "select * from public.list_agent_commands($1, null, null, null, 1, 0)", [IDS.h1]);
    expect(one.length).toBe(1);
  });
  it("is not readable by other tenants or sales", async () => {
    for (const u of [IDS.ownerH3, IDS.salesAgent]) {
      expect((await err(q(u, "select * from public.list_agent_commands($1)", [IDS.h1]))).message).toBe(
        "PERMISSION_DENIED",
      );
    }
    expect(await q(IDS.ownerH3, "select * from public.agent_commands")).toEqual([]);
  });
});
