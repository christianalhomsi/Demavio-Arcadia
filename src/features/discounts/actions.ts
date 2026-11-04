"use server";

import { revalidatePath } from "next/cache";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import { isUuid } from "@/lib/auth/authorize";
import { parseMoneyForCurrency } from "@/lib/money";
import { dateToIso } from "@/lib/timeOfDay";
import { getHallCurrency } from "@/features/invoices/queries";
import {
  applyDiscountSchema,
  discountSchema,
  percentToBasisPoints,
  type ApplyDiscountInput,
  type DiscountInput,
} from "./schemas";

const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

/** Creates (discountId null) or edits a discount definition. Owners only; the RPC re-checks it. */
export async function upsertDiscountAction(
  hallId: string,
  discountId: string | null,
  input: DiscountInput,
): Promise<ActionResult<{ id: string }>> {
  return withPermission(hallId, "discount.manage", async () => {
    const parsed = discountSchema.safeParse(input);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return invalid(String(i?.path[0] ?? "name"), i?.message ?? "Invalid input");
    }
    if (discountId !== null && !isUuid(discountId)) return invalid("name", "Invalid request");
    const d = parsed.data;

    let value: number | null;
    if (d.kind === "percent") {
      value = percentToBasisPoints(d.valueText);
      if (value === null) return invalid("valueText", "Enter a percent from 0.01 to 100.");
    } else {
      const currency = await getHallCurrency(hallId);
      if (!currency) return fail("NOT_FOUND", "That hall could not be found.");
      value = parseMoneyForCurrency(d.valueText, currency);
      if (value === null || value < 1) return invalid("valueText", "Enter a valid amount.");
    }

    const validFrom = d.validFrom === "" ? null : dateToIso(d.validFrom);
    const validUntil = d.validUntil === "" ? null : dateToIso(d.validUntil, true);
    if (d.validFrom !== "" && validFrom === null)
      return invalid("validFrom", "Enter a valid date.");
    if (d.validUntil !== "" && validUntil === null)
      return invalid("validUntil", "Enter a valid date.");

    let maxUses: number | null = null;
    if (d.maxUses !== "") {
      if (!/^\d{1,6}$/.test(d.maxUses) || Number(d.maxUses) < 1)
        return invalid("maxUses", "Enter a whole number of 1 or more.");
      maxUses = Number(d.maxUses);
    }

    const r = await callRpc<string>("upsert_discount", {
      p_hall_id: hallId,
      p_id: discountId,
      p_name: d.name,
      p_kind: d.kind,
      p_value: value,
      p_valid_from: validFrom,
      p_valid_until: validUntil,
      p_max_uses: maxUses,
      p_active: d.active,
    });
    if (!r.ok) return r;
    revalidatePath(`/halls/${hallId}/discounts`);
    return { ok: true, data: { id: r.data } };
  });
}

/** Applies a discount to an unpaid invoice. The amount is decided by the database, not sent by the client. */
export async function applyDiscountAction(
  hallId: string,
  invoiceId: string,
  input: ApplyDiscountInput,
  idempotencyKey: string,
): Promise<ActionResult<{ id: string }>> {
  return withPermission(hallId, "discount.apply", async () => {
    const parsed = applyDiscountSchema.safeParse(input);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return invalid(String(i?.path[0] ?? "reason"), i?.message ?? "Invalid input");
    }
    if (!isUuid(invoiceId) || !isUuid(parsed.data.discountId) || !isUuid(idempotencyKey))
      return invalid("discountId", "Invalid request");
    const r = await callRpc<string>("apply_discount", {
      p_invoice_id: invoiceId,
      p_discount_id: parsed.data.discountId,
      p_reason: parsed.data.reason,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    revalidatePath(`/halls/${hallId}/invoices`);
    revalidatePath(`/halls/${hallId}/invoices/${invoiceId}`);
    return { ok: true, data: { id: r.data } };
  });
}
