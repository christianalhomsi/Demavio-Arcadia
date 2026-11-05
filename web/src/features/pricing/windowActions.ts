"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import { isUuid } from "@/lib/auth/authorize";
import { parseMoneyForCurrency } from "@/lib/money";
import { hmToMinutes } from "@/lib/timeOfDay";
import { getHallCurrency } from "@/features/invoices/queries";

const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

const windowInput = z.object({
  /** "hall", "device:<uuid>" or "category:<name>". */
  target: z.string().max(60),
  days: z.array(z.number().int().min(1).max(7)).min(1, "Choose at least one day").max(7),
  /** "HH:MM". */
  from: z.string().max(5),
  to: z.string().max(5),
  /** Typed hourly rate, e.g. "9.00". Converted to minor units on the server. */
  rateText: z.string().trim().min(1, "Enter a rate").max(20),
});
export type WindowInput = z.infer<typeof windowInput>;

/** Creates (windowId null) or edits a time window. The database rejects overlaps. */
export async function upsertWindowAction(
  hallId: string,
  windowId: string | null,
  input: WindowInput,
): Promise<ActionResult<{ id: string }>> {
  return withPermission(hallId, "hall.settings.manage", async () => {
    const parsed = windowInput.safeParse(input);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return invalid(String(i?.path[0] ?? "days"), i?.message ?? "Invalid input");
    }
    if (windowId !== null && !isUuid(windowId)) return invalid("days", "Invalid request");
    const d = parsed.data;

    let scope: "hall" | "category" | "device" = "hall";
    let deviceId: string | null = null;
    let category: string | null = null;
    if (d.target.startsWith("device:")) {
      scope = "device";
      deviceId = d.target.slice(7);
      if (!isUuid(deviceId)) return invalid("target", "Choose a device");
    } else if (d.target.startsWith("category:")) {
      scope = "category";
      category = d.target.slice(9).trim() || null;
      if (!category) return invalid("target", "Choose a category");
    } else if (d.target !== "hall") return invalid("target", "Invalid request");

    const from = hmToMinutes(d.from);
    const to = hmToMinutes(d.to);
    if (from === null || to === null || to <= from || from > 1439)
      return invalid("from", "Enter a valid time range.");

    const currency = await getHallCurrency(hallId);
    if (!currency) return fail("NOT_FOUND", "That hall could not be found.");
    const rate = parseMoneyForCurrency(d.rateText, currency);
    if (rate === null) return invalid("rateText", "Enter a valid rate.");

    const r = await callRpc<string>("upsert_pricing_window", {
      p_hall_id: hallId,
      p_id: windowId,
      p_scope: scope,
      p_device_id: deviceId,
      p_category: category,
      p_days: [...new Set(d.days)].sort(),
      p_start: from,
      p_end: to,
      p_rate_minor: rate,
    });
    if (!r.ok) return r;
    revalidatePath(`/halls/${hallId}/pricing`);
    return { ok: true, data: { id: r.data } };
  });
}

export async function deleteWindowAction(
  hallId: string,
  windowId: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "hall.settings.manage", async () => {
    if (!isUuid(windowId)) return invalid("days", "Invalid request");
    const r = await callRpc<null>("delete_pricing_window", { p_id: windowId });
    if (!r.ok) return r;
    revalidatePath(`/halls/${hallId}/pricing`);
    return { ok: true, data: null };
  });
}
