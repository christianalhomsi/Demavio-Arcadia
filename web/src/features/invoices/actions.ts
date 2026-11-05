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

const adjustTimeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("up") }),
  z.object({ mode: z.literal("down") }),
  z.object({
    mode: z.literal("custom"),
    amount: z.string().trim().min(1, "Enter the price for the time").max(20),
    reason: z.string().trim().min(3, "Write a short reason").max(300),
  }),
]);
export type AdjustTimeInput = z.infer<typeof adjustTimeSchema>;

/**
 * Owner-only: changes how the time on an unpaid invoice is charged (round up, round down, or their own
 * price). The database recomputes the invoice and refuses once it has a payment, discount or write-off.
 */
export async function adjustInvoiceTimeAction(
  hallId: string,
  invoiceId: string,
  input: AdjustTimeInput,
): Promise<ActionResult<{ totalMinor: number }>> {
  return withPermission(hallId, "payment.adjust", async () => {
    const parsed = adjustTimeSchema.safeParse(input);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return invalid(String(i?.path[0] ?? "mode"), i?.message ?? "Invalid input");
    }
    if (!isUuid(invoiceId)) return invalid("mode", "Invalid request");
    const d = parsed.data;

    let amountMinor: number | null = null;
    if (d.mode === "custom") {
      const found = (await listInvoices(hallId, { limit: 1, offset: 0, invoiceId }))?.rows[0];
      if (!found) return fail("NOT_FOUND", "That invoice could not be found.");
      amountMinor = parseMoneyForCurrency(d.amount, found.currency);
      if (amountMinor === null || amountMinor < 0) return invalid("amount", "Enter a valid price.");
    }

    const r = await callRpc<number>("adjust_invoice_time", {
      p_invoice_id: invoiceId,
      p_mode: d.mode,
      p_amount_minor: amountMinor,
      p_reason: d.mode === "custom" ? d.reason : null,
    });
    if (!r.ok) {
      return r.code === "PRECONDITION_FAILED"
        ? fail("PRECONDITION_FAILED", "This invoice can no longer be changed.")
        : r;
    }
    refresh(hallId);
    revalidatePath(`/halls/${hallId}/invoices/${invoiceId}`);
    return { ok: true, data: { totalMinor: Number(r.data) } };
  });
}

/** Fixes who an unpaid invoice is for: a registered player's username, or a guest name. */
export async function setInvoicePayerAction(
  hallId: string,
  invoiceId: string,
  input: { username: string; guestName: string },
): Promise<ActionResult<null>> {
  return withPermission(hallId, "payment.collect", async () => {
    if (!isUuid(invoiceId)) return invalid("username", "Invalid request");
    const username = input.username.trim().replace(/^@/, "");
    const guestName = input.guestName.trim();
    if (username && !/^[A-Za-z0-9_]{3,20}$/.test(username))
      return invalid("username", "Enter the player's username (letters, numbers, _)");
    if (!username && (guestName.length < 1 || guestName.length > 80))
      return invalid("guestName", "Enter the customer's name or username");
    const r = await callRpc<null>("set_invoice_payer", {
      p_invoice_id: invoiceId,
      p_username: username || null,
      p_guest_name: username ? null : guestName,
    });
    if (!r.ok) {
      if (r.code === "NOT_FOUND")
        return invalid("username", "No player was found with that username.");
      if (r.code === "PRECONDITION_FAILED")
        return fail("PRECONDITION_FAILED", "This invoice can no longer be changed.");
      return r;
    }
    refresh(hallId);
    revalidatePath(`/halls/${hallId}/invoices/${invoiceId}`);
    return { ok: true, data: null };
  });
}
