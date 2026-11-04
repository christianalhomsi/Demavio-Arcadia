"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import { isUuid } from "@/lib/auth/authorize";
import { parseMoneyForCurrency } from "@/lib/money";
import { getHallCurrency } from "@/features/invoices/queries";

const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

const rateInput = z.object({
  scope: z.enum(["hall", "category", "device"]),
  deviceId: z.string().nullable(),
  category: z.string().trim().max(40).nullable(),
  /** Typed hourly rate, e.g. "6.00". Converted to minor units on the server. */
  rateText: z.string().trim().min(1, "Enter a rate").max(20),
  /** Players-priced devices (PlayStation, billiards): rate for 2 or 4 players. Omitted = any. */
  playersCount: z
    .union([z.literal(2), z.literal(4)])
    .nullable()
    .optional(),
});
export type RateInput = z.infer<typeof rateInput>;

export async function setRateAction(hallId: string, input: RateInput): Promise<ActionResult<null>> {
  return withPermission(hallId, "hall.settings.manage", async () => {
    const parsed = rateInput.safeParse(input);
    if (!parsed.success)
      return invalid("rateText", parsed.error.issues[0]?.message ?? "Invalid input");
    const { scope, deviceId, category, rateText, playersCount } = parsed.data;
    if (playersCount && scope === "hall")
      return invalid("playersCount", "Player-count rates apply to a category or a device.");
    if (scope === "device" && (!deviceId || !isUuid(deviceId)))
      return invalid("deviceId", "Choose a device");
    if (scope === "category" && !category) return invalid("category", "Enter a category");
    const currency = await getHallCurrency(hallId);
    if (!currency) return fail("NOT_FOUND", "That hall could not be found.");
    const rate = parseMoneyForCurrency(rateText, currency);
    if (rate === null) return invalid("rateText", "Enter a valid rate.");

    const r = await callRpc<string>("set_pricing_rate", {
      p_hall_id: hallId,
      p_scope: scope,
      p_device_id: scope === "device" ? deviceId : null,
      p_category: scope === "category" ? category : null,
      p_rate_minor: rate,
      ...(playersCount ? { p_players_count: playersCount } : {}),
    });
    if (r.ok) revalidatePath(`/halls/${hallId}/pricing`);
    return r.ok ? { ok: true, data: null } : r;
  });
}

export async function deleteRateAction(
  hallId: string,
  ruleId: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "hall.settings.manage", async () => {
    if (!isUuid(ruleId)) return invalid("rule", "Invalid request");
    const r = await callRpc<null>("delete_pricing_rate", { p_rule_id: ruleId });
    if (r.ok) revalidatePath(`/halls/${hallId}/pricing`);
    return r;
  });
}

const billingInput = z.object({
  incrementMinutes: z
    .number({ error: "Enter a number" })
    .int()
    .min(1, "At least 1")
    .max(60, "At most 60"),
  minBillableMinutes: z
    .number({ error: "Enter a number" })
    .int()
    .min(0, "At least 0")
    .max(240, "At most 240"),
});
export type BillingInput = z.infer<typeof billingInput>;

export async function updateBillingRulesAction(
  hallId: string,
  input: BillingInput,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "hall.settings.manage", async () => {
    const parsed = billingInput.safeParse(input);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return invalid(String(i?.path[0] ?? "incrementMinutes"), i?.message ?? "Invalid input");
    }
    const r = await callRpc<null>("update_billing_rules", {
      p_hall_id: hallId,
      p_increment_minutes: parsed.data.incrementMinutes,
      p_min_minutes: parsed.data.minBillableMinutes,
    });
    if (r.ok) revalidatePath(`/halls/${hallId}/pricing`);
    return r;
  });
}
