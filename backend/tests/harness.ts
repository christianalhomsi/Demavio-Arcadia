import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

export const IDS = {
  tenant1: "11111111-0000-0000-0000-000000000001",
  tenant2: "11111111-0000-0000-0000-000000000002",
  h1: "22222222-0000-0000-0000-000000000001",
  h2: "22222222-0000-0000-0000-000000000002",
  h3: "22222222-0000-0000-0000-000000000003",
  ownerH1H2: "33333333-0000-0000-0000-00000000000a",
  employeeH1: "33333333-0000-0000-0000-00000000000b",
  formerEmployeeH1: "33333333-0000-0000-0000-00000000000c",
  ownerH3: "33333333-0000-0000-0000-00000000000d",
  superAdmin: "33333333-0000-0000-0000-00000000000e",
  salesAgent: "33333333-0000-0000-0000-00000000000f",
  customerOnly: "33333333-0000-0000-0000-000000000010",
  deactivated: "33333333-0000-0000-0000-000000000011",
} as const;

/** Builds a fresh database: Supabase stubs + every migration in order + seed. */
export async function createDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  await db.exec(readFileSync(join(__dirname, "supabase-stubs.sql"), "utf8"));
  const dir = join(root, "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
  return db;
}

/** Runs `fn` as the given user (null = anon), the way PostgREST does: role + JWT claims. */
export async function asUser<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    if (userId) {
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
      await db.exec("set local role authenticated");
    } else {
      await db.exec("set local role anon");
    }
    return await fn();
  } finally {
    await db.exec("rollback");
  }
}
