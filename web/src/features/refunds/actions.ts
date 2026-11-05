"use server";

import { revalidatePath } from "next/cache";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import { isUuid } from "@/lib/auth/authorize";
import { parseMoneyForCurrency } from "@/lib/money";
import { getHallCurrency } from "@/features/invoices/queries";
import { REFUND_REASONS } from "./schemas";

const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

export async function requestRefundAction(
  hallId: string,
  paymentId: string,
  input: { amountText: string; reasonCode: string; note: string },
  idempotencyKey: string,
): Promise<ActionResult<{ refundId: string }>> {
  return withPermission(hallId, "refund.request", async () => {
    if (!isUuid(paymentId) || !isUuid(idempotencyKey)) return invalid("amount", "Invalid request");
    if (!REFUND_REASONS.some((r) => r.value === input.reasonCode))
      return invalid("reasonCode", "Choose a reason");
    if (input.reasonCode === "other" && input.note.trim().length === 0)
      return invalid("note", "A note is required");
    if (input.note.length > 300) return invalid("note", "At most 300 characters");
    const currency = await getHallCurrency(hallId);
    if (!currency) return fail("NOT_FOUND", "That hall could not be found.");
    const amount = parseMoneyForCurrency(input.amountText, currency);
    if (amount === null || amount <= 0) return invalid("amount", "Enter a valid amount.");

    const r = await callRpc<string>("request_refund", {
      p_payment_id: paymentId,
      p_amount_minor: amount,
      p_reason_code: input.reasonCode,
      p_note: input.note.trim() || null,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    revalidatePath(`/halls/${hallId}/refunds`);
    revalidatePath(`/halls/${hallId}/invoices`);
    return { ok: true, data: { refundId: r.data } };
  });
}

/** Approving credits the original payment method. The database enforces who may approve and the limits. */
export async function decideRefundAction(
  hallId: string,
  refundId: string,
  approve: boolean,
  note: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "refund.approve", async () => {
    if (!isUuid(refundId)) return invalid("note", "Invalid request");
    if (note.length > 300) return invalid("note", "At most 300 characters");
    const r = await callRpc<null>("decide_refund", {
      p_refund_id: refundId,
      p_approve: approve,
      p_note: note.trim() || null,
    });
    if (r.ok) {
      revalidatePath(`/halls/${hallId}/refunds`);
      revalidatePath(`/halls/${hallId}/invoices`);
      revalidatePath(`/halls/${hallId}/wallets`);
    }
    return r;
  });
}
