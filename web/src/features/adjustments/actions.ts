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

const reasonSchema = z.string().trim().min(3, "Enter at least 3 characters").max(300);

/** Writes off part or all of what is still owed. An empty amount means everything owed. */
export async function writeOffInvoiceAction(
  hallId: string,
  invoiceId: string,
  amountText: string,
  reason: string,
  idempotencyKey: string,
): Promise<ActionResult<{ id: string }>> {
  return withPermission(hallId, "payment.adjust", async () => {
    if (!isUuid(invoiceId) || !isUuid(idempotencyKey)) return invalid("amount", "Invalid request");
    const why = reasonSchema.safeParse(reason);
    if (!why.success) return invalid("reason", why.error.issues[0]?.message ?? "Enter a reason");
    let amount: number | null = null;
    if (amountText.trim() !== "") {
      const currency = await getHallCurrency(hallId);
      if (!currency) return fail("NOT_FOUND", "That hall could not be found.");
      amount = parseMoneyForCurrency(amountText, currency);
      if (amount === null || amount <= 0) return invalid("amount", "Enter a valid amount.");
    }
    const r = await callRpc<string>("write_off_invoice", {
      p_invoice_id: invoiceId,
      p_amount_minor: amount,
      p_reason: why.data,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    revalidatePath(`/halls/${hallId}/invoices`);
    revalidatePath(`/halls/${hallId}/invoices/${invoiceId}`);
    revalidatePath(`/halls/${hallId}/adjustments`);
    return { ok: true, data: { id: r.data } };
  });
}
