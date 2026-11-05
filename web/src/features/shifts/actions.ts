"use server";

import { revalidatePath } from "next/cache";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import { isUuid } from "@/lib/auth/authorize";
import { parseMoneyForCurrency } from "@/lib/money";
import { getHallCurrency } from "@/features/invoices/queries";
import { MOVEMENT_KINDS } from "./schemas";

const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

function revalidateShifts(hallId: string) {
  revalidatePath(`/halls/${hallId}/shifts`);
  revalidatePath(`/halls/${hallId}/registers`);
}

/** Typed amounts are converted with the HALL's currency here; the database re-validates the range. */
async function parseHallAmount(
  hallId: string,
  text: string,
  field: string,
  { allowZero }: { allowZero: boolean },
): Promise<{ minor: number } | { error: ActionResult<never> }> {
  const currency = await getHallCurrency(hallId);
  if (!currency) return { error: fail("NOT_FOUND", "That hall could not be found.") };
  const minor = parseMoneyForCurrency(text, currency);
  if (minor === null || minor < 0 || (!allowZero && minor === 0))
    return { error: invalid(field, "Enter a valid amount.") };
  return { minor };
}

export async function openShiftAction(
  hallId: string,
  openingCashText: string,
  idempotencyKey: string,
): Promise<ActionResult<{ shiftId: string }>> {
  return withPermission(hallId, "shift.open", async () => {
    if (!isUuid(idempotencyKey)) return invalid("openingCash", "Invalid request");
    const amount = await parseHallAmount(hallId, openingCashText, "openingCash", {
      allowZero: true,
    });
    if ("error" in amount) return amount.error;
    const r = await callRpc<string>("open_shift", {
      p_hall_id: hallId,
      p_register_id: null,
      p_opening_cash_minor: amount.minor,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    revalidateShifts(hallId);
    return { ok: true, data: { shiftId: r.data } };
  });
}

export interface CloseShiftResult {
  expectedMinor: number;
  countedMinor: number;
  differenceMinor: number;
  overridden: boolean;
  unpaidCount: number;
}

/**
 * Closes a shift. The database decides whether unpaid invoices block it and who may override;
 * the override reason is only sent when the person asked to override.
 */
export async function closeShiftAction(
  hallId: string,
  shiftId: string,
  input: { countedCashText: string; overrideReason?: string },
  idempotencyKey: string,
): Promise<ActionResult<CloseShiftResult>> {
  return withPermission(hallId, "shift.close", async () => {
    if (!isUuid(shiftId) || !isUuid(idempotencyKey))
      return invalid("countedCash", "Invalid request");
    const reason = input.overrideReason?.trim() || null;
    if (reason && (reason.length < 3 || reason.length > 300))
      return invalid("overrideReason", "Enter a reason of 3 to 300 characters.");
    const amount = await parseHallAmount(hallId, input.countedCashText, "countedCash", {
      allowZero: true,
    });
    if ("error" in amount) return amount.error;
    const r = await callRpc<{
      expected_minor: number;
      counted_minor: number;
      difference_minor: number;
      overridden: boolean;
      unpaid_count: number;
    }>("close_shift", {
      p_shift_id: shiftId,
      p_counted_cash_minor: amount.minor,
      p_override_reason: reason,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    revalidateShifts(hallId);
    revalidatePath(`/halls/${hallId}/invoices`);
    return {
      ok: true,
      data: {
        expectedMinor: Number(r.data.expected_minor),
        countedMinor: Number(r.data.counted_minor),
        differenceMinor: Number(r.data.difference_minor),
        overridden: Boolean(r.data.overridden),
        unpaidCount: Number(r.data.unpaid_count),
      },
    };
  });
}

/** Payouts and manual adjustments: owner-level (payment.adjust), always with a reason. */
export async function recordCashMovementAction(
  hallId: string,
  shiftId: string,
  input: { kind: string; amountText: string; reason: string },
  idempotencyKey: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "payment.adjust", async () => {
    if (!isUuid(shiftId) || !isUuid(idempotencyKey)) return invalid("amount", "Invalid request");
    if (!MOVEMENT_KINDS.some((k) => k.value === input.kind))
      return invalid("kind", "Choose a type");
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 300)
      return invalid("reason", "Enter a reason of 3 to 300 characters.");
    const amount = await parseHallAmount(hallId, input.amountText, "amount", { allowZero: false });
    if ("error" in amount) return amount.error;
    const r = await callRpc<string>("record_cash_movement", {
      p_shift_id: shiftId,
      p_kind: input.kind,
      p_amount_minor: amount.minor,
      p_reason: reason,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    revalidateShifts(hallId);
    return { ok: true, data: null };
  });
}
