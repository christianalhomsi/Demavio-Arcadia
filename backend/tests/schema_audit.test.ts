import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDb } from "./harness";

// Structural guards on the migrated schema (PGlite only, no real database touched).
describe("schema audit", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await createDb();
  }, 120_000);

  it("every public table has RLS enabled", async () => {
    const r = await db.query(
      `select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity`,
    );
    expect(r.rows).toEqual([]);
  });

  it("every SECURITY DEFINER function pins search_path", async () => {
    const r = await db.query(`select p.proname from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) x where x like 'search_path=%')`);
    expect(r.rows).toEqual([]);
  });

  it("anon can only execute the intended public functions", async () => {
    const r = await db.query<{ proname: string }>(`select p.proname from pg_proc p where p.pronamespace='public'::regnamespace
      and has_function_privilege('anon', p.oid, 'execute') and p.prokind='f' order by 1`);
    expect(r.rows.map((x) => x.proname)).toEqual([
      "get_public_hall", "list_public_device_busy", "list_public_devices", "list_public_halls",
      "quote_public_price", "username_available",
    ]);
  });

  it("payments has a (hall_id, created_at) index for report queries", async () => {
    const r = await db.query(`select 1 from pg_indexes where indexname='payments_hall_created_idx'`);
    expect(r.rows.length).toBe(1);
  });
});
