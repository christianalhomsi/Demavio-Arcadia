"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import { isUuid } from "@/lib/auth/authorize";
import { parseMoneyForCurrency } from "@/lib/money";
import { listInvoices } from "./queries";

const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

const paymentSchema = z.object({
  method: z.enum(["cash", "wallet"]),
  walletId: z.string().nullable(),
  /** "full" pays whatever the DATABASE says is outstanding; "custom" is a typed partial amount. */
  amount: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("full") }),
    z.object({
      kind: z.literal("custom"),
      text: z.string().trim().min(1, "Enter an amount").max(20),
    }),
  ]),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

function refresh(hallId: string) {
  revalidatePath(`/halls/${hallId}/invoices`);
  revalidatePath(`/halls/${hallId}/wallets`);
}

/**
 * Collects a payment. The amount owed is read from the database (never trusted from the browser)
 * and the payment itself is one atomic, idempotent database function.
 */
export async function collectPaymentAction(
  hallId: string,
  invoiceId: string,
  input: PaymentInput,
  idempotencyKey: string,
): Promise<ActionResult<{ paymentId: string }>> {
  return withPermission(hallId, "payment.collect", async () => {
    const parsed = paymentSchema.safeParse(input);
    if (!parsed.success)
      return invalid("amount", parsed.error.issues[0]?.message ?? "Invalid input");
    if (!isUuid(invoiceId) || !isUuid(idempotencyKey)) return invalid("amount", "Invalid request");
    const { method, walletId, amount } = parsed.data;
    if (method === "wallet" && (!walletId || !isUuid(walletId)))
      return invalid("walletId", "Choose a wallet");

    const found = (await listInvoices(hallId, { limit: 1, offset: 0, invoiceId }))?.rows[0];
    if (!found) return fail("NOT_FOUND", "That invoice could not be found.");

    let amountMinor: number;
    if (amount.kind === "full") {
      amountMinor = found.outstandingMinor;
    } else {
      const parsedAmount = parseMoneyForCurrency(amount.text, found.currency);
      if (parsedAmount === null || parsedAmount <= 0)
        return invalid("amount", "Enter a valid amount.");
      amountMinor = parsedAmount;
    }

    const r =
      method === "cash"
        ? await callRpc<string>("record_cash_payment", {
            p_invoice_id: invoiceId,
            p_amount_minor: amountMinor,
            p_key: idempotencyKey,
          })
        : await callRpc<string>("pay_invoice_from_wallet", {
            p_invoice_id: invoiceId,
            p_wallet_id: walletId,
            p_amount_minor: amountMinor,
            p_key: idempotencyKey,
          });
    if (!r.ok) return r;
    refresh(hallId);
    return { ok: true, data: { paymentId: r.data } };
  });
}

export async function voidInvoiceAction(
  hallId: string,
  invoiceId: string,
  reason: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "payment.adjust", async () => {
    if (!isUuid(invoiceId)) return invalid("reason", "Invalid request");
    if (reason.trim().length === 0) return invalid("reason", "A reason is required");
    const r = await callRpc<null>("void_invoice", {
      p_invoice_id: invoiceId,
      p_reason: reason.trim(),
    });
    if (r.ok) refresh(hallId);
    return r;
  });
}
