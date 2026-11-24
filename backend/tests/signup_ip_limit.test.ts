// Per-IP sign-up request limit (migration 0055).
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 120_000);
afterAll(async () => {
  await db.close();
});

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

async function allow(hash: string): Promise<boolean> {
  await db.exec("begin");
  try {
    await db.exec("set local role service_role");
    const r = await db.query<{ ok: boolean }>("select public.signup_ip_allow($1) as ok", [hash]);
    await db.exec("commit");
    return r.rows[0].ok;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}

describe("signup_ip_allow", () => {
  it("allows 10 requests per IP per hour, then refuses", async () => {
    for (let i = 0; i < 10; i++) expect(await allow(hashA)).toBe(true);
    expect(await allow(hashA)).toBe(false);
    expect(await allow(hashA)).toBe(false);
  });

  it("counts each IP separately", async () => {
    expect(await allow(hashB)).toBe(true);
  });

  it("starts a new window after an hour", async () => {
    await db.query("update public.signup_ip_limits set window_started_at = now() - interval '61 minutes' where ip_hash = $1", [hashA]);
    expect(await allow(hashA)).toBe(true);
    const r = await db.query<{ request_count: number }>("select request_count from public.signup_ip_limits where ip_hash = $1", [hashA]);
    expect(r.rows[0].request_count).toBe(1);
  });

  it("rejects a malformed hash", async () => {
    await expect(allow("short")).rejects.toThrow();
  });

  it("cannot be called or read by app users", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec("begin");
      try {
        await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: IDS.customerOnly, role })]);
        await db.exec(`set local role ${role}`);
        await expect(db.query("select public.signup_ip_allow($1)", [hashB])).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec("rollback");
      }
      await db.exec("begin");
      try {
        await db.exec(`set local role ${role}`);
        await expect(db.query("select * from public.signup_ip_limits")).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec("rollback");
      }
    }
  });
});
