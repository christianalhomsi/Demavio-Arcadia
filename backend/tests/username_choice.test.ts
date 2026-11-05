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

async function newUser(email: string, meta: Record<string, unknown>) {
  const id = crypto.randomUUID();
  await db.query(
    "insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, $3::jsonb, now(), now())",
    [id, email, JSON.stringify(meta)],
  );
  return id;
}
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
const set = (user: string, name: string) => q(user, "select public.set_my_username($1)", [name]);

describe("choosing a username after a Google sign-in", () => {
  it("the context shows no username until one is chosen, then shows it", async () => {
    const u = await newUser("lina.haddad@gmail.com", { name: "Lina Haddad" });
    const before = (await q(u, "select public.get_my_context() as c"))[0].c;
    expect(before.profile.username).toBeNull();
    await set(u, "Lina_Plays");
    const after = (await q(u, "select public.get_my_context() as c"))[0].c;
    expect(after.profile.username).toBe("lina_plays");
  });
  it("can be chosen only once", async () => {
    const u = await newUser("once@gmail.com", { name: "Once Person" });
    await set(u, "first_choice");
    expect((await err(set(u, "second_choice"))).detail).toBe("username_set");
  });
  it("must be unique, in any letter case", async () => {
    const a = await newUser("a1@gmail.com", { name: "A One" });
    const b = await newUser("b1@gmail.com", { name: "B One" });
    await set(a, "shared_name");
    expect((await err(set(b, "SHARED_name"))).detail).toBe("username_taken");
  });
  it("must not be the Google name or the email's first part", async () => {
    const u = await newUser("khaled.omar@gmail.com", { name: "Khaled Omar" });
    expect((await err(set(u, "khaledomar"))).detail).toBe("username_same_as_account");
    expect((await err(set(u, "Khaled_Omar"))).detail).toBe("username_same_as_account");
    expect((await err(set(u, "khaled_omar"))).detail).toBe("username_same_as_account");
    await set(u, "kh_gamer");
  });
  it("must have a valid shape", async () => {
    const u = await newUser("shape@gmail.com", { name: "Someone Else" });
    for (const bad of ["ab", "x".repeat(21), "has space", "dash-name", "", "اسم_عربي"]) {
      expect((await err(set(u, bad))).detail).toBe("username");
    }
  });
  it("is closed to anonymous callers and inactive users", async () => {
    await db.exec("begin");
    await db.exec("set local role anon");
    await expect(db.query("select public.set_my_username('anon_try')")).rejects.toThrow(/permission denied/i);
    await db.exec("rollback");
    const u = await newUser("off@gmail.com", { name: "Off Person" });
    await db.query("update public.profiles set status = 'inactive' where id = $1", [u]);
    expect((await err(set(u, "off_name"))).message).toBe("PERMISSION_DENIED");
  });
});
