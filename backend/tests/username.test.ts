import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

const signUp = (email: string, meta: Record<string, unknown>) =>
  db.query(
    "insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1, $2::jsonb, now(), now())",
    [email, JSON.stringify(meta)],
  );
const username = async (email: string) =>
  (await db.query<any>("select username from public.profiles where email = $1", [email])).rows[0]?.username;
const available = async (name: string | null, role = "anon") => {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    const r = await db.query<any>("select public.username_available($1) as ok", [name]);
    await db.exec("commit");
    return r.rows[0].ok as boolean;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
};

describe("profile username", () => {
  it("is stored in lowercase when a user signs up with one", async () => {
    await signUp("a@example.test", { full_name: "Sam", username: "  Sam_99 " });
    expect(await username("a@example.test")).toBe("sam_99");
  });
  it("stays empty for accounts without one (Google, older accounts)", async () => {
    await signUp("g@example.test", { name: "Google Person" });
    expect(await username("g@example.test")).toBeNull();
    await signUp("bad@example.test", { username: "x" });
    expect(await username("bad@example.test")).toBeNull(); // too short is ignored, not accepted
    await signUp("bad2@example.test", { username: "has space" });
    expect(await username("bad2@example.test")).toBeNull();
  });
  it("is unique regardless of case: the second sign-up with the same name fails", async () => {
    await signUp("u1@example.test", { username: "taken_name" });
    await expect(signUp("u2@example.test", { username: "TAKEN_name" })).rejects.toThrow(/unique|duplicate/i);
    expect(await username("u2@example.test")).toBeUndefined();
  });
  it("cannot be set to an invalid value directly", async () => {
    await expect(db.exec("update public.profiles set username = 'A' where email = 'a@example.test'")).rejects.toThrow();
    await expect(db.exec("update public.profiles set username = 'UPPERCASE' where email = 'a@example.test'")).rejects.toThrow();
    await expect(db.exec("update public.profiles set username = 'taken_name' where email = 'a@example.test'")).rejects.toThrow();
  });
  it("username_available answers true/false, before sign-in too", async () => {
    expect(await available("free_name")).toBe(true);
    expect(await available("Free_Name")).toBe(true);
    expect(await available("taken_name")).toBe(false);
    expect(await available("TAKEN_NAME", "authenticated")).toBe(false);
    for (const bad of ["ab", "x".repeat(21), "has space", "emoji😀", "", null]) {
      expect(await available(bad as string | null)).toBe(false);
    }
  });
});
