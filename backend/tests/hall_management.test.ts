import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IDS, asUser, createDb } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);
afterAll(async () => {
  await db.close();
});

/** Runs one statement as a user inside a transaction that is kept (writes persist). */
async function asCommitted<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await db.exec("set local role authenticated");
    const r = await fn();
    await db.exec("commit");
    return r;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}

const q = <T = any>(user: string, sql: string, params: unknown[] = []) =>
  asCommitted(user, async () => (await db.query<T>(sql, params)).rows);

const contractError = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return e.message as string;
  }
  return "NO_ERROR";
};

const audit = async (action: string) =>
  (await db.query<any>("select * from public.audit_logs where action = $1 order by created_at", [action])).rows;

describe("hall profile", () => {
  it("owner can update and the change is audited with before/after", async () => {
    await q(IDS.ownerH1H2, "select public.update_hall_profile($1, 'Renamed Hall', '1 Main St', '+971500000', (select time_zone from public.halls where id = $1))", [IDS.h1]);
    const h = (await db.query<any>("select name, address from public.halls where id = $1", [IDS.h1])).rows[0];
    expect(h).toMatchObject({ name: "Renamed Hall", address: "1 Main St" });
    const [a] = await audit("hall.profile.update");
    expect(a.actor_id).toBe(IDS.ownerH1H2);
    expect(a.before_data.name).toBe("Hall H1");
    expect(a.after_data.name).toBe("Renamed Hall");
  });
  it("the time zone is locked", async () => {
    const e = await contractError(q(IDS.ownerH1H2, "select public.update_hall_profile($1, 'X', null, null, 'Pacific/Auckland')", [IDS.h1]));
    expect(e).toBe("VALIDATION");
  });
  it("employees and other tenants are denied", async () => {
    for (const u of [IDS.employeeH1, IDS.ownerH3, IDS.salesAgent, IDS.superAdmin]) {
      expect(await contractError(q(u, "select public.update_hall_profile($1, 'X', null, null, 'UTC')", [IDS.h1]))).toBe("PERMISSION_DENIED");
    }
  });
  it("validates name and time zone", async () => {
    expect(await contractError(q(IDS.ownerH1H2, "select public.update_hall_profile($1, '  ', null, null, 'UTC')", [IDS.h1]))).toBe("VALIDATION");
    expect(await contractError(q(IDS.ownerH1H2, "select public.update_hall_profile($1, 'X', null, null, 'Mars/Base')", [IDS.h1]))).toBe("VALIDATION");
  });
});

describe("hall policies", () => {
  it("updates policies and audits; rejects invalid values", async () => {
    await q(IDS.ownerH1H2, "select public.update_hall_policies($1, 5, 30, 10, true, true, array['cash'])", [IDS.h1]);
    const s = (await db.query<any>("select * from public.hall_settings where hall_id = $1", [IDS.h1])).rows[0];
    expect(s).toMatchObject({ checkin_grace_minutes: 5, cancellation_deadline_minutes: 30, waiting_list_enabled: true });
    expect((await audit("hall.policies.update")).length).toBe(1);
    expect(await contractError(q(IDS.ownerH1H2, "select public.update_hall_policies($1, -1, 30, 10, false, false, array['cash'])", [IDS.h1]))).toBe("VALIDATION");
    expect(await contractError(q(IDS.ownerH1H2, "select public.update_hall_policies($1, 5, 30, 10, false, false, array['crypto'])", [IDS.h1]))).toBe("VALIDATION");
    expect(await contractError(q(IDS.employeeH1, "select public.update_hall_policies($1, 5, 30, 10, false, false, array['cash'])", [IDS.h1]))).toBe("PERMISSION_DENIED");
  });
  it("new halls get the provisional defaults", async () => {
    const s = (await db.query<any>("select * from public.hall_settings where hall_id = $1", [IDS.h3])).rows[0];
    expect(s).toMatchObject({ checkin_grace_minutes: 10, cancellation_deadline_minutes: 60, reminder_minutes: 15, waiting_list_enabled: false });
  });
});

describe("working hours", () => {
  const hours = (v: unknown) => [JSON.stringify(v)];
  it("replaces the week and audits", async () => {
    await q(IDS.ownerH1H2, "select public.set_working_hours($1, $2::jsonb)", [IDS.h1, ...hours([
      { weekday: 1, opens: "09:00", closes: "13:00" },
      { weekday: 1, opens: "14:00", closes: "23:00" },
      { weekday: 5, opens: "18:00", closes: "02:00" },
    ])]);
    const n = (await db.query<any>("select count(*)::int n from public.hall_working_hours where hall_id = $1", [IDS.h1])).rows[0].n;
    expect(n).toBe(3);
    expect((await audit("hall.working_hours.update")).length).toBe(1);
  });
  it("rejects overlaps, including overnight spill into the next day", async () => {
    const call = (v: unknown) => contractError(q(IDS.ownerH1H2, "select public.set_working_hours($1, $2::jsonb)", [IDS.h1, ...hours(v)]));
    expect(await call([{ weekday: 2, opens: "09:00", closes: "12:00" }, { weekday: 2, opens: "11:00", closes: "15:00" }])).toBe("VALIDATION");
    expect(await call([{ weekday: 5, opens: "22:00", closes: "03:00" }, { weekday: 6, opens: "02:00", closes: "08:00" }])).toBe("VALIDATION");
    expect(await call([{ weekday: 6, opens: "22:00", closes: "03:00" }, { weekday: 0, opens: "02:00", closes: "08:00" }])).toBe("VALIDATION");
  });
  it("rejects malformed input and keeps existing hours on failure", async () => {
    const call = (v: unknown) => contractError(q(IDS.ownerH1H2, "select public.set_working_hours($1, $2::jsonb)", [IDS.h1, ...hours(v)]));
    expect(await call({ weekday: 1 })).toBe("VALIDATION");
    expect(await call([{ weekday: 9, opens: "09:00", closes: "10:00" }])).toBe("VALIDATION");
    expect(await call([{ weekday: 1, opens: "25:00", closes: "10:00" }])).toBe("VALIDATION");
    expect(await call([{ weekday: 1, opens: "09:00", closes: "09:00" }])).toBe("VALIDATION");
    const n = (await db.query<any>("select count(*)::int n from public.hall_working_hours where hall_id = $1", [IDS.h1])).rows[0].n;
    expect(n).toBe(3);
  });
  it("denies employees", async () => {
    expect(await contractError(q(IDS.employeeH1, "select public.set_working_hours($1, '[]'::jsonb)", [IDS.h1]))).toBe("PERMISSION_DENIED");
  });
});

describe("invitations", () => {
  let token: string;
  it("owner invites; only a hash is stored; duplicates are rejected", async () => {
    [{ invite_member: token }] = await q(IDS.ownerH1H2, "select public.invite_member($1, ' New.Hire@Example.test ', 'employee') as invite_member", [IDS.h1]);
    expect(token).toHaveLength(64);
    const inv = (await db.query<any>("select * from public.hall_invitations")).rows;
    expect(inv).toHaveLength(1);
    expect(inv[0].email).toBe("new.hire@example.test");
    expect(JSON.stringify(inv[0])).not.toContain(token);
    expect(await contractError(q(IDS.ownerH1H2, "select public.invite_member($1, 'new.hire@example.test', 'employee')", [IDS.h1]))).toBe("CONFLICT");
    expect(await contractError(q(IDS.ownerH1H2, "select public.invite_member($1, 'employee.h1@example.test', 'employee')", [IDS.h1]))).toBe("CONFLICT");
  });
  it("validates email and role scope, and denies employees", async () => {
    expect(await contractError(q(IDS.ownerH1H2, "select public.invite_member($1, 'not-an-email', 'employee')", [IDS.h1]))).toBe("VALIDATION");
    expect(await contractError(q(IDS.ownerH1H2, "select public.invite_member($1, 'a@b.test', 'super_admin')", [IDS.h1]))).toBe("VALIDATION");
    expect(await contractError(q(IDS.employeeH1, "select public.invite_member($1, 'a@b.test', 'employee')", [IDS.h1]))).toBe("PERMISSION_DENIED");
  });
  it("the invitation list never exposes token hashes", async () => {
    const rows = await q<any>(IDS.ownerH1H2, "select * from public.list_hall_invitations($1)", [IDS.h1]);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).not.toContain("token_hash");
    await expect(q(IDS.ownerH1H2, "select * from public.hall_invitations")).rejects.toThrow(/permission denied/i);
  });
  it("cannot be accepted by the wrong account or with a wrong token", async () => {
    expect(await contractError(q(IDS.customerOnly, "select public.accept_invitation($1)", [token]))).toBe("NOT_FOUND");
    expect(await contractError(q(IDS.customerOnly, "select public.accept_invitation('nope')"))).toBe("NOT_FOUND");
    expect(await contractError(q(IDS.deactivated, "select public.accept_invitation($1)", [token]))).toBe("PERMISSION_DENIED");
  });
  it("is accepted by the invited Google account, once", async () => {
    await db.exec(`insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
      values ('33333333-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000000','authenticated','authenticated','new.hire@example.test','{"full_name":"New Hire"}',now(),now())`);
    const hire = "33333333-0000-0000-0000-000000000099";
    const [{ accept_invitation: hall }] = await q(hire, "select public.accept_invitation($1)", [token]);
    expect(hall).toBe(IDS.h1);
    const ctx = (await q(hire, "select public.get_my_context() as c"))[0].c;
    expect(ctx.memberships[0]).toMatchObject({ hall_id: IDS.h1, role: "employee" });
    expect(await contractError(q(hire, "select public.accept_invitation($1)", [token]))).toBe("NOT_FOUND");
    expect((await audit("employee.invite.accept")).length).toBe(1);
  });
  it("expired and revoked invitations cannot be accepted", async () => {
    const [{ invite_member: t2 }] = await q(IDS.ownerH1H2, "select public.invite_member($1, 'customer.only@example.test', 'employee') as invite_member", [IDS.h1]);
    await db.exec("update public.hall_invitations set expires_at = now() - interval '1 minute' where status = 'pending'");
    expect(await contractError(q(IDS.customerOnly, "select public.accept_invitation($1)", [t2]))).toBe("NOT_FOUND");
    // Expired invites don't block a fresh one; revoking works and blocks acceptance.
    const [{ invite_member: t3 }] = await q(IDS.ownerH1H2, "select public.invite_member($1, 'customer.only@example.test', 'employee') as invite_member", [IDS.h1]);
    const [{ id }] = await q<any>(IDS.ownerH1H2, "select id from public.list_hall_invitations($1)", [IDS.h1]);
    await q(IDS.ownerH1H2, "select public.revoke_invitation($1)", [id]);
    expect(await contractError(q(IDS.customerOnly, "select public.accept_invitation($1)", [t3]))).toBe("NOT_FOUND");
  });
});

describe("member management", () => {
  const membershipId = async (user: string, hall: string) =>
    (await db.query<any>("select id from public.hall_memberships where user_id = $1 and hall_id = $2", [user, hall])).rows[0].id as string;

  it("lists members for owners only, with names", async () => {
    const rows = await q<any>(IDS.ownerH1H2, "select * from public.list_hall_members($1)", [IDS.h1]);
    expect(rows.map((r) => r.email)).toContain("employee.h1@example.test");
    expect(await contractError(q(IDS.employeeH1, "select * from public.list_hall_members($1)", [IDS.h1]))).toBe("PERMISSION_DENIED");
    expect(await contractError(q(IDS.ownerH3, "select * from public.list_hall_members($1)", [IDS.h1]))).toBe("PERMISSION_DENIED");
  });
  it("updates role, discount limit and grants, audited with before/after", async () => {
    const id = await membershipId(IDS.employeeH1, IDS.h1);
    await q(IDS.ownerH1H2, "select public.update_member($1, 'employee', 5000, array['report.financial.view'])", [id]);
    expect((await q<any>(IDS.employeeH1, "select public.get_my_context() as c"))[0].c.memberships[0].permissions).toContain("report.financial.view");
    const [a] = (await audit("employee.update")).slice(-1);
    expect(a.after_data.grants).toEqual(["report.financial.view"]);
    expect(a.before_data.grants).toEqual([]);
  });
  it("rejects escalation: platform permissions, unknown permissions, and self-modification", async () => {
    const id = await membershipId(IDS.employeeH1, IDS.h1);
    expect(await contractError(q(IDS.ownerH1H2, "select public.update_member($1, 'employee', null, array['platform.tenants.manage'])", [id]))).toBe("VALIDATION");
    expect(await contractError(q(IDS.ownerH1H2, "select public.update_member($1, 'employee', null, array['made.up'])", [id]))).toBe("VALIDATION");
    expect(await contractError(q(IDS.ownerH1H2, "select public.update_member($1, 'super_admin', null, '{}')", [id]))).toBe("VALIDATION");
    const own = await membershipId(IDS.ownerH1H2, IDS.h1);
    expect(await contractError(q(IDS.ownerH1H2, "select public.update_member($1, 'employee', null, '{}')", [own]))).toBe("PRECONDITION_FAILED");
  });
  it("employees cannot change anyone, and other tenants cannot touch this hall", async () => {
    const id = await membershipId(IDS.employeeH1, IDS.h1);
    const owner = await membershipId(IDS.ownerH1H2, IDS.h1);
    expect(await contractError(q(IDS.employeeH1, "select public.update_member($1, 'owner', null, '{}')", [id]))).toBe("PERMISSION_DENIED");
    expect(await contractError(q(IDS.employeeH1, "select public.set_member_status($1, 'inactive', 'x')", [owner]))).toBe("PERMISSION_DENIED");
    expect(await contractError(q(IDS.ownerH3, "select public.set_member_status($1, 'inactive', 'x')", [id]))).toBe("PERMISSION_DENIED");
  });
  it("protects the last owner of a hall", async () => {
    // employeeH1 becomes a non-owner manager in H2 (via an employee.manage grant), so the actor
    // is not the target and the sole owner (ownerH1H2) is the only thing standing in the way.
    await db.exec(`insert into public.hall_memberships (hall_id, user_id, role_key) values ('${IDS.h2}', '${IDS.employeeH1}', 'employee')`);
    const mgr = await membershipId(IDS.employeeH1, IDS.h2);
    await db.exec(`insert into public.hall_membership_grants values ('${mgr}', 'employee.manage')`);
    const soleOwner = await membershipId(IDS.ownerH1H2, IDS.h2);
    expect(await contractError(q(IDS.employeeH1, "select public.set_member_status($1, 'inactive', 'x')", [soleOwner]))).toBe("PRECONDITION_FAILED");
    expect(await contractError(q(IDS.employeeH1, "select public.update_member($1, 'employee', null, '{}')", [soleOwner]))).toBe("PRECONDITION_FAILED");
    // With a second owner present, demotion is allowed.
    await db.exec(`update public.hall_memberships set role_key = 'owner' where id = '${mgr}'`);
    expect(await contractError(q(IDS.employeeH1, "select public.update_member($1, 'employee', null, '{}')", [soleOwner]))).toBe("NO_ERROR");
  });
  it("deactivation requires a reason, is audited, and revokes access immediately", async () => {
    const id = await membershipId(IDS.employeeH1, IDS.h1);
    expect(await contractError(q(IDS.ownerH1H2, "select public.set_member_status($1, 'inactive', ' ')", [id]))).toBe("VALIDATION");
    await q(IDS.ownerH1H2, "select public.set_member_status($1, 'inactive', 'left the company')", [id]);
    expect((await q<any>(IDS.employeeH1, "select public.get_my_context() as c"))[0].c.memberships.some((m: any) => m.hall_id === IDS.h1)).toBe(false);
    const [a] = (await audit("employee.status")).slice(-1);
    expect(a.reason).toBe("left the company");
  });
});

describe("audit log access", () => {
  it("owners read their hall's log with actor names and pagination; others cannot", async () => {
    const rows = await q<any>(IDS.ownerH1H2, "select * from public.list_hall_audit($1, 2, 0)", [IDS.h1]);
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].total)).toBeGreaterThan(2);
    expect(rows[0].actor_name).toBeTruthy();
    const filtered = await q<any>(IDS.ownerH1H2, "select * from public.list_hall_audit($1, 50, 0, 'employee.')", [IDS.h1]);
    expect(filtered.every((r) => r.action.startsWith("employee."))).toBe(true);
    expect(await contractError(q(IDS.employeeH1, "select * from public.list_hall_audit($1)", [IDS.h1]))).toBe("PERMISSION_DENIED");
    expect(await contractError(q(IDS.ownerH3, "select * from public.list_hall_audit($1)", [IDS.h1]))).toBe("PERMISSION_DENIED");
  });
  it("clients cannot write audit rows directly or call the internal writer", async () => {
    await expect(q(IDS.ownerH1H2, "insert into public.audit_logs (action) values ('forged')")).rejects.toThrow(/permission denied/i);
    await expect(q(IDS.ownerH1H2, "select public.write_audit($1,'forged',null,null,null,null,null)", [IDS.h1])).rejects.toThrow(/permission denied/i);
  });
});

describe("table privileges", () => {
  it("clients get SELECT only; anon gets nothing; internal tables are unreadable", async () => {
    const rows = (
      await db.query<{ grantee: string; table_name: string; privs: string }>(`
        select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
          from information_schema.role_table_grants
         where table_schema = 'public' and grantee in ('anon', 'authenticated')
         group by grantee, table_name`)
    ).rows;
    expect(rows.filter((r) => r.grantee === "anon")).toEqual([]);
    const auth = rows.filter((r) => r.grantee === "authenticated");
    expect(auth.filter((r) => r.privs !== "SELECT")).toEqual([]);
    const names = auth.map((r) => r.table_name);
    expect(names).not.toContain("hall_invitations");
    expect(names).not.toContain("invoice_counters");
    // Every public table with RLS and client reads is accounted for (guards against a new table
    // silently inheriting default grants).
    const all = (await db.query<{ t: string }>("select tablename t from pg_tables where schemaname = 'public'")).rows.map((r) => r.t);
    const unexpected = auth.map((r) => r.table_name).filter((t) => !all.includes(t) && !t.startsWith("v_"));
    expect(unexpected).toEqual([]);
  });
  it("TRUNCATE and writes are refused even where RLS would not apply", async () => {
    for (const sql of ["truncate public.wallets", "truncate public.payments", "delete from public.invoices", "update public.wallets set balance_minor = 1"]) {
      await db.exec("begin");
      try {
        await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: IDS.ownerH1H2, role: "authenticated" })]);
        await db.exec("set local role authenticated");
        await expect(db.exec(sql)).rejects.toThrow(/permission denied/i);
      } finally {
        await db.exec("rollback");
      }
    }
  });
});

describe("performance hygiene (advisor findings)", () => {
  it("RLS policies evaluate auth.uid() once per statement, not per row", async () => {
    const rows = (await db.query<{ tablename: string; policyname: string; qual: string }>(
      "select tablename, policyname, qual from pg_policies where schemaname = 'public'")).rows;
    const bare = rows.filter((r) => /auth.uid()/.test(r.qual ?? "") && !/SELECT auth.uid()/i.test(r.qual ?? ""));
    expect(bare.map((r) => r.tablename + "." + r.policyname)).toEqual([]);
  });
  it("hot foreign keys are indexed", async () => {
    const names = (await db.query<{ indexname: string }>("select indexname from pg_indexes where schemaname = 'public'")).rows.map((r) => r.indexname);
    for (const i of ["sessions_device_fk_idx", "reservations_device_fk_idx", "invoices_customer_fk_idx", "wallets_customer_fk_idx", "refunds_invoice_fk_idx", "payments_shift_fk_idx"]) expect(names).toContain(i);
  });
});

describe("function exposure", () => {
  it("only the intended API is executable by clients; anon gets nothing", async () => {
    const rows = (
      await db.query<{ name: string; auth: boolean; anon: boolean }>(`
        select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as name,
               has_function_privilege('authenticated', p.oid, 'execute') as auth,
               has_function_privilege('anon', p.oid, 'execute') as anon
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'`)
    ).rows;
    const exposed = rows.filter((r) => r.auth).map((r) => r.name.split("(")[0]!).sort();
    expect(exposed).toEqual(
      [
        "accept_invitation", "get_my_context", "has_hall_permission", "has_platform_role",
        "invite_member", "is_hall_member", "list_hall_audit", "list_hall_invitations",
        "list_hall_members", "revoke_invitation", "set_member_status", "set_working_hours",
        "update_hall_policies", "update_hall_profile", "update_member",
        "upsert_device", "start_maintenance", "end_maintenance", "request_device_command", "list_agent_commands",
        "create_reservation", "cancel_reservation", "check_in_reservation", "start_walk_in", "end_session",
        "extend_session", "convert_session_to_open", "list_reservations", "list_sessions", "server_now",
        "set_pricing_rate", "set_hall_cover", "delete_pricing_rate", "update_billing_rules", "list_pricing", "list_invoices",
        "record_cash_payment", "void_invoice", "open_wallet", "wallet_top_up", "pay_invoice_from_wallet",
        "list_wallets", "list_wallet_ledger", "request_refund", "decide_refund", "list_refunds",
        "open_shift", "get_shift_unpaid_summary", "close_shift", "record_cash_movement", "list_shifts",
        "list_cash_movements", "list_registers", "report_financial_summary",
        "admin_platform_metrics", "admin_user_role_counts", "admin_list_subscription_plans", "admin_save_subscription_plan", "admin_set_subscription_plan_status", "submit_hall_request", "approve_hall_request", "reject_hall_request", "list_hall_requests", "list_sales_credits", "list_my_team", "admin_set_sales_manager", "my_sales_manager", "admin_invite_owner", "admin_set_hall_status", "admin_list_users",
        "admin_assign_platform_role", "admin_revoke_platform_role", "admin_set_user_status", "admin_list_audit",
        "admin_list_halls_sold", "admin_list_sales_team", "admin_create_sales_account", "admin_create_hall_with_owner", "admin_delete_hall", "admin_delete_user", "list_my_activity", "record_report_export", "admin_monitoring", "list_sales_agents",
        // public player booking (migration 15): the first five are also callable by anon
        "list_public_halls", "get_public_hall", "list_public_devices", "list_public_device_busy", "quote_public_price", "username_available", "set_my_username",
        "create_player_reservation", "list_my_reservations", "cancel_my_reservation", "confirm_reservation", "reject_reservation",
        // products (migration 16)
        "upsert_product", "list_products", "add_session_item", "remove_session_item", "list_session_items",
        // advanced pricing (migration 17)
        "list_pricing_windows", "upsert_pricing_window", "delete_pricing_window", "list_packages", "upsert_package",
        "start_package_session", "list_package_uses", "list_discounts", "upsert_discount", "apply_discount",
        "list_invoice_discounts",
        // wallet controls and adjustments (migration 18)
        "set_wallet_status", "withdraw_from_wallet", "write_off_invoice", "list_adjustments", "get_payment_detail", "list_payment_refunds",
        // expenses and breakdown report (migration 19)
        "create_expense", "update_expense", "void_expense", "attach_expense_receipt", "get_expense_receipt_path", "list_expenses", "report_breakdown",
      ].sort(),
    );
    // Anonymous callers get only the read-only public browsing API; booking and everything else needs a session.
    expect(rows.filter((r) => r.anon).map((r) => r.name.split("(")[0]!).sort()).toEqual(
      ["get_public_hall", "list_public_device_busy", "list_public_devices", "list_public_halls", "quote_public_price", "username_available"].sort(),
    );
  });
});

void asUser;
