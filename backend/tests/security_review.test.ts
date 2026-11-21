// Regression tests for the security review of 2026-11-21 (migration 0052): each one tries the attack.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IDS, createDb } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

/** Runs one statement as a user in a committed transaction, like PostgREST. */
async function q<T = any>(user: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: user, role: "authenticated" }),
    ]);
    await db.exec("set local role authenticated");
    const r = (await db.query<T>(sql, params)).rows;
    await db.exec("commit");
    return r;
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
const membership = async (user: string, hall = IDS.h1) =>
  (await db.query<any>("select id from public.hall_memberships where hall_id = $1 and user_id = $2", [hall, user])).rows[0].id as string;
async function newUser(email: string, appMeta: object | null = null) {
  const id = crypto.randomUUID();
  await db.query(
    `insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '{}', $3, now(), now())`,
    [id, email, appMeta === null ? null : JSON.stringify(appMeta)],
  );
  return id;
}

describe("1. a delegated employee manager cannot make or remove owners", () => {
  it("is refused every path to the owner role, but can still manage employees", async () => {
    const owner = IDS.ownerH1H2;
    const emp = IDS.employeeH1;
    // The owner delegates employee management (a supported setup).
    await db.query("insert into public.hall_membership_grants values ($1, 'employee.manage')", [await membership(emp)]);

    // Invite a second account as owner: refused.
    expect((await err(q(emp, "select public.invite_member($1,'alt@attacker.test','owner')", [IDS.h1]))).detail).toBe("owner_only");
    // Inviting an employee still works.
    await q(emp, "select public.invite_member($1,'helper@example.test','employee')", [IDS.h1]);

    // A colleague (any account) to promote: refused.
    const colleague = await newUser("colleague@example.test");
    await db.query("insert into public.hall_memberships (hall_id, user_id, role_key, status) values ($1,$2,'employee','active')", [IDS.h1, colleague]);
    const cm = await membership(colleague);
    expect((await err(q(emp, "select public.update_member($1,'owner',null,'{}')", [cm]))).detail).toBe("owner_only");
    // Raising a colleague's discount limit: owner-only.
    expect((await err(q(emp, "select public.update_member($1,'employee',999999,'{}')", [cm]))).detail).toBe("owner_only");

    // Demoting or deactivating the real owner: refused.
    const om = await membership(owner);
    expect((await err(q(emp, "select public.update_member($1,'employee',null,'{}')", [om]))).detail).toBe("owner_only");
    expect((await err(q(emp, "select public.set_member_status($1,'inactive','takeover')", [om]))).detail).toBe("owner_only");

    // The owner can still do all of it.
    await q(owner, "select public.update_member($1,'employee',500,'{}')", [cm]);
    await q(owner, "select public.invite_member($1,'co.owner@example.test','owner')", [IDS.h1]);
  });

  it("an owner invitation is void once its inviter is no longer an owner", async () => {
    const [{ t }] = await q(IDS.ownerH1H2, "select public.invite_member($1,'late.owner@example.test','owner') as t", [IDS.h1]);
    const late = await newUser("late.owner@example.test");
    // The inviter is demoted (simulated directly) before the invitation is accepted.
    await db.query("update public.hall_memberships set role_key = 'employee' where hall_id = $1 and user_id = $2", [IDS.h1, IDS.ownerH1H2]);
    try {
      expect((await err(q(late, "select public.accept_invitation($1)", [t]))).message).toBe("NOT_FOUND");
    } finally {
      await db.query("update public.hall_memberships set role_key = 'owner' where hall_id = $1 and user_id = $2", [IDS.h1, IDS.ownerH1H2]);
    }
  });
});

describe("2. hall staff never see a customer's email", () => {
  it("a wallet opened by username shows the name, not the email", async () => {
    const victim = await newUser("victim.private@example.test");
    await db.query("update public.profiles set username = 'victim_user', display_name = null where id = $1", [victim]);
    await q(IDS.employeeH1, "select public.open_shift($1,null,0,$2)", [IDS.h1, crypto.randomUUID()]).catch(() => null);
    const [{ id }] = await q(IDS.employeeH1, "select public.open_wallet_by_username($1,'victim_user') as id", [IDS.h1]);
    const [row] = await q(IDS.employeeH1, "select * from public.list_wallets($1,null,25,0,$2)", [IDS.h1, id]);
    expect(row.customer_email).toBeNull();
    expect(row.username).toBe("victim_user");
    // Searching by the email finds nothing.
    expect(await q(IDS.employeeH1, "select * from public.list_wallets($1,'victim.private')", [IDS.h1])).toEqual([]);
  });
  it("the email-based wallet lookups are closed to clients", async () => {
    for (const sql of [
      "select public.open_wallet($1, 'customer.only@example.test')",
      "select public.link_guest_wallet($1, 'customer.only@example.test')",
    ]) {
      expect((await err(q(IDS.ownerH1H2, sql, [IDS.h1]))).message).toMatch(/permission denied/i);
    }
  });
});

describe("3. accounts are created only by the app's own paths", () => {
  it("refuses Supabase's open email sign-up", async () => {
    const e = await err(newUser("squat@example.test", { provider: "email", providers: ["email"] }));
    expect(e.message).toMatch(/only possible through the app/);
    expect((await db.query<any>("select 1 from public.profiles where email = 'squat@example.test'")).rows).toEqual([]);
  });
  it("accepts an OTP sign-up whose code was just verified, even before Auth writes app_metadata", async () => {
    await db.query(
      `insert into public.pending_signups (email, username, code_hash, expires_at, claimed_until)
       values ('verified@example.test', 'verified_user', 'x', now() + interval '10 minutes', now() + interval '30 seconds')`,
    );
    await newUser("verified@example.test", { provider: "email", providers: ["email"] });
    expect((await db.query<any>("select 1 from public.profiles where email = 'verified@example.test'")).rows).toHaveLength(1);
    // An expired claim does not count.
    await db.query(
      `insert into public.pending_signups (email, username, code_hash, expires_at, claimed_until)
       values ('stale@example.test', 'stale_user', 'x', now() + interval '10 minutes', now() - interval '1 second')`,
    );
    expect((await err(newUser("stale@example.test", { provider: "email", providers: ["email"] }))).message).toMatch(/only possible/);
  });
  it("accepts the OTP sign-up (service role marker), Google, and platform-made owners", async () => {
    await newUser("otp@example.test", { provider: "email", providers: ["email"], arcadia_signup: "trusted" });
    await newUser("google@example.test", { provider: "google", providers: ["google"] });
    for (const e of ["otp@example.test", "google@example.test"]) {
      expect((await db.query<any>("select 1 from public.profiles where email = $1", [e])).rows).toHaveLength(1);
    }
    const [{ id }] = (await db.query<any>("select public.create_login_user('made@example.test','secret123','made_owner','Made') as id")).rows;
    const meta = (await db.query<any>("select raw_app_meta_data m from auth.users where id = $1", [id])).rows[0].m;
    expect(meta.arcadia_signup).toBe("trusted");
  });
});
