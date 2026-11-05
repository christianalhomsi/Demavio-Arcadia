"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPlatformRole } from "@/lib/actions/withPlatformRole";
import { isUuid } from "@/lib/auth/authorize";
import { parseMoneyForCurrency } from "@/lib/money";
import { HALL_CURRENCIES, PLAN_PERIODS, PLATFORM_ROLES } from "./schemas";

const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

const emailSchema = z.email("Enter a valid email").max(254, "Email is too long");
const nameSchema = z.string().trim().min(1, "Enter a name").max(120, "At most 120 characters");
const reasonSchema = z.string().trim().min(3, "Enter a reason (at least 3 characters)").max(300);

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/sales", "layout");
}

/** Returns the one-time owner invitation token; the UI shows it once as a link. */
export async function inviteOwnerAction(
  hallId: string,
  email: string,
): Promise<ActionResult<{ token: string }>> {
  return withPlatformRole("super_admin", async () => {
    if (!isUuid(hallId)) return invalid("email", "Invalid request");
    const e = emailSchema.safeParse(email.trim());
    if (!e.success) return invalid("email", e.error.issues[0]!.message);
    const r = await callRpc<string>("admin_invite_owner", { p_hall_id: hallId, p_email: e.data });
    if (!r.ok) return r.code === "CONFLICT" ? invalid("email", r.message) : r;
    refresh();
    return { ok: true, data: { token: r.data } };
  });
}

async function setStatus(
  fn: "admin_set_hall_status" | "admin_set_user_status",
  idKey: "p_hall_id" | "p_user_id",
  id: string,
  status: string,
  reason: string,
): Promise<ActionResult<null>> {
  return withPlatformRole("super_admin", async () => {
    if (!isUuid(id)) return invalid("reason", "Invalid request");
    if (status !== "active" && status !== "inactive") return invalid("reason", "Invalid status");
    const r = reasonSchema.safeParse(reason);
    if (!r.success) return invalid("reason", r.error.issues[0]!.message);
    const res = await callRpc<null>(fn, { [idKey]: id, p_status: status, p_reason: r.data });
    if (res.ok) refresh();
    return res;
  });
}

export async function setHallStatusAction(hallId: string, status: string, reason: string) {
  return setStatus("admin_set_hall_status", "p_hall_id", hallId, status, reason);
}
export async function setUserStatusAction(userId: string, status: string, reason: string) {
  return setStatus("admin_set_user_status", "p_user_id", userId, status, reason);
}

/** Super admin: any platform role. Sales admin: only sales_agent. The database enforces it again. */
export async function assignPlatformRoleAction(
  email: string,
  role: string,
): Promise<ActionResult<null>> {
  return withPlatformRole(["super_admin", "sales_admin"], async () => {
    const e = emailSchema.safeParse(email.trim());
    if (!e.success) return invalid("email", e.error.issues[0]!.message);
    if (!PLATFORM_ROLES.some((r) => r.value === role)) return invalid("role", "Choose a role");
    const r = await callRpc<null>("admin_assign_platform_role", { p_email: e.data, p_role: role });
    if (!r.ok) {
      return r.code === "NOT_FOUND"
        ? invalid(
            "email",
            "No active account with that email. They need to create an account first.",
          )
        : r;
    }
    revalidatePath("/admin", "layout");
    revalidatePath("/sales", "layout");
    return r;
  });
}

export async function revokePlatformRoleAction(
  userId: string,
  role: string,
): Promise<ActionResult<null>> {
  return withPlatformRole(["super_admin", "sales_admin"], async () => {
    if (!isUuid(userId) || !PLATFORM_ROLES.some((r) => r.value === role))
      return invalid("role", "Invalid request");
    const r = await callRpc<null>("admin_revoke_platform_role", {
      p_user_id: userId,
      p_role: role,
    });
    if (r.ok) {
      revalidatePath("/admin", "layout");
      revalidatePath("/sales", "layout");
    }
    return r;
  });
}

const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,20}$/, "3 to 20 letters, digits or underscores");

/**
 * Super admin: creates a sales account (email + password) from the dashboard. The password is hashed
 * by the database and is not logged. `responsibleId` empty = the person creating it.
 */
export async function createSalesAccountAction(input: {
  email: string;
  password: string;
  username: string;
  displayName: string;
  role: string;
  responsibleId: string;
}): Promise<ActionResult<{ userId: string }>> {
  return withPlatformRole("super_admin", async () => {
    const email = emailSchema.safeParse(input.email.trim());
    if (!email.success) return invalid("email", email.error.issues[0]!.message);
    if (input.password.length < 8 || input.password.length > 72)
      return invalid("password", "Use 8 to 72 characters");
    const username = usernameSchema.safeParse(input.username);
    if (!username.success) return invalid("username", username.error.issues[0]!.message);
    if (input.displayName.trim().length > 120)
      return invalid("displayName", "At most 120 characters");
    if (input.role !== "sales_agent" && input.role !== "sales_admin")
      return invalid("role", "Choose a role");
    const responsible = input.responsibleId.trim();
    if (responsible && !isUuid(responsible))
      return invalid("responsibleId", "Choose who is responsible");
    const r = await callRpc<string>("admin_create_sales_account", {
      p_email: email.data,
      p_password: input.password,
      p_username: username.data,
      p_display_name: input.displayName.trim() || null,
      p_role: input.role,
      p_responsible: responsible || null,
    });
    if (!r.ok) {
      if (r.code === "CONFLICT")
        return invalid(
          r.message.toLowerCase().includes("username") ? "username" : "email",
          r.message,
        );
      return r;
    }
    refresh();
    return { ok: true, data: { userId: r.data } };
  });
}

/**
 * Super admin or sales manager: creates a hall together with its owner's sign-in (email + password). Every hall is in
 * Syria time; the currency is SYP or USD. The password is hashed by the database and never logged.
 */
export async function createHallWithOwnerAction(
  input: {
    name: string;
    currency: string;
    email: string;
    password: string;
    username: string;
    planId?: string;
  },
  idempotencyKey: string,
): Promise<ActionResult<{ hallId: string }>> {
  return withPlatformRole(["super_admin", "sales_admin"], async () => {
    if (!isUuid(idempotencyKey)) return invalid("name", "Invalid request");
    const name = nameSchema.safeParse(input.name);
    if (!name.success) return invalid("name", name.error.issues[0]!.message);
    const currency = input.currency.trim().toUpperCase();
    if (!HALL_CURRENCIES.some((c) => c === currency))
      return invalid("currency", "Choose SYP or USD");
    const email = emailSchema.safeParse(input.email.trim());
    if (!email.success) return invalid("email", email.error.issues[0]!.message);
    if (input.password.length < 8 || input.password.length > 72)
      return invalid("password", "Use 8 to 72 characters");
    const username = usernameSchema.safeParse(input.username);
    if (!username.success) return invalid("username", username.error.issues[0]!.message);
    const planId = input.planId?.trim() ?? "";
    if (planId && !isUuid(planId)) return invalid("planId", "Choose a subscription");
    const r = await callRpc<string>("admin_create_hall_with_owner", {
      p_hall_name: name.data,
      p_currency: currency,
      p_email: email.data,
      p_password: input.password,
      p_username: username.data,
      p_key: idempotencyKey,
      p_plan_id: planId || null,
    });
    if (!r.ok) {
      if (r.code === "NOT_FOUND")
        return invalid("planId", "This subscription is no longer available");
      if (r.code === "CONFLICT")
        return invalid(
          r.message.toLowerCase().includes("username") ? "username" : "email",
          r.message,
        );
      return r;
    }
    refresh();
    return { ok: true, data: { hallId: r.data } };
  });
}

/**
 * Super admin: permanently deletes a hall with everything in it (sessions, invoices, payments, wallets,
 * activity log) and the accounts that only belonged to it. Irreversible. The reason is recorded in an
 * audit entry that is not tied to the deleted hall.
 */
export async function deleteHallAction(
  hallId: string,
  reason: string,
): Promise<ActionResult<{ accountsDeleted: number; accountsKept: number }>> {
  return withPlatformRole("super_admin", async () => {
    if (!isUuid(hallId)) return invalid("reason", "Invalid request");
    const why = reasonSchema.safeParse(reason);
    if (!why.success) return invalid("reason", why.error.issues[0]!.message);
    const r = await callRpc<{ accounts_deleted: number; accounts_kept: number }>(
      "admin_delete_hall",
      { p_hall_id: hallId, p_reason: why.data },
    );
    if (!r.ok) return r;
    refresh();
    revalidatePath("/halls", "layout");
    return {
      ok: true,
      data: { accountsDeleted: r.data.accounts_deleted, accountsKept: r.data.accounts_kept },
    };
  });
}

/** Super admin: permanently deletes one account. Owners must have their hall deleted first. */
export async function deleteUserAction(
  userId: string,
  reason: string,
): Promise<ActionResult<null>> {
  return withPlatformRole("super_admin", async () => {
    if (!isUuid(userId)) return invalid("reason", "Invalid request");
    const why = reasonSchema.safeParse(reason);
    if (!why.success) return invalid("reason", why.error.issues[0]!.message);
    const r = await callRpc<null>("admin_delete_user", { p_user_id: userId, p_reason: why.data });
    if (r.ok) refresh();
    return r;
  });
}

/** Super admin: sets the manager of a sales agent; an empty id clears it. */
export async function setSalesManagerAction(
  userId: string,
  managerId: string,
): Promise<ActionResult<null>> {
  return withPlatformRole("super_admin", async () => {
    if (!isUuid(userId) || (managerId && !isUuid(managerId)))
      return invalid("manager", "Choose a manager");
    const r = await callRpc<null>("admin_set_sales_manager", {
      p_user_id: userId,
      p_manager_id: managerId || null,
    });
    if (r.ok) refresh();
    return r;
  });
}

const planSchema = z.object({
  period: z.enum(PLAN_PERIODS, "Choose the subscription period"),
  name: z.string().trim().max(80, "At most 80 characters"),
  details: z.string().trim().max(1000, "At most 1000 characters"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((c) => HALL_CURRENCIES.some((h) => h === c), "Choose SYP or USD"),
  price: z.string().trim().min(1, "Enter the price"),
});

/** Super admin: creates (planId empty, needs a key) or edits a subscription plan. Halls keep the price they were sold at. */
export async function saveSubscriptionPlanAction(
  planId: string,
  input: { period: string; name: string; details: string; currency: string; price: string },
  idempotencyKey: string,
): Promise<ActionResult<{ planId: string }>> {
  return withPlatformRole("super_admin", async () => {
    const p = planSchema.safeParse(input);
    if (!p.success) {
      const issue = p.error.issues[0]!;
      return invalid(String(issue.path[0] ?? "name"), issue.message);
    }
    if (planId && !isUuid(planId)) return invalid("name", "Invalid request");
    if (!planId && !isUuid(idempotencyKey)) return invalid("name", "Invalid request");
    const minor = parseMoneyForCurrency(p.data.price, p.data.currency);
    if (minor === null || !Number.isSafeInteger(minor))
      return invalid("price", "Enter a valid price");
    const r = await callRpc<string>("admin_save_subscription_plan", {
      p_id: planId || null,
      p_period: p.data.period,
      p_name: p.data.name,
      p_details: p.data.details || null,
      p_price_minor: minor,
      p_currency: p.data.currency,
      p_key: planId ? null : idempotencyKey,
    });
    if (!r.ok) return r;
    refresh();
    return { ok: true, data: { planId: r.data } };
  });
}

export async function setSubscriptionPlanStatusAction(
  planId: string,
  status: string,
): Promise<ActionResult<null>> {
  return withPlatformRole("super_admin", async () => {
    if (!isUuid(planId)) return invalid("status", "Invalid request");
    if (status !== "active" && status !== "inactive") return invalid("status", "Invalid status");
    const r = await callRpc<null>("admin_set_subscription_plan_status", {
      p_id: planId,
      p_status: status,
    });
    if (r.ok) refresh();
    return r;
  });
}
