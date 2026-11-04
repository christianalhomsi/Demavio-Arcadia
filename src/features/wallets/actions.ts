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

const emailSchema = z.email("Enter the customer's account email").max(254);

export async function openWalletAction(
  hallId: string,
  email: string,
): Promise<ActionResult<{ walletId: string }>> {
  return withPermission(hallId, "wallet.top_up", async () => {
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success)
      return invalid("email", parsed.error.issues[0]?.message ?? "Enter a valid email");
    const r = await callRpc<string>("open_wallet", {
      p_hall_id: hallId,
      p_customer_email: parsed.data,
    });
    if (!r.ok) {
      // Deliberately generic: do not reveal whether an account exists for this email.
      return r.code === "NOT_FOUND"
        ? invalid("email", "No customer account was found for that email.")
        : r;
    }
    revalidatePath(`/halls/${hallId}/wallets`);
    return { ok: true, data: { walletId: r.data } };
  });
}

/** Cash top-up. The typed amount is converted to minor units using the HALL's currency, server-side. */
export async function topUpWalletAction(
  hallId: string,
  walletId: string,
  amountText: string,
  idempotencyKey: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "wallet.top_up", async () => {
    if (!isUuid(walletId) || !isUuid(idempotencyKey)) return invalid("amount", "Invalid request");
    const currency = await getHallCurrency(hallId);
    if (!currency) return fail("NOT_FOUND", "That hall could not be found.");
    const amount = parseMoneyForCurrency(amountText, currency);
    if (amount === null || amount <= 0) return invalid("amount", "Enter a valid amount.");
    const r = await callRpc<string>("wallet_top_up", {
      p_wallet_id: walletId,
      p_amount_minor: amount,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    revalidatePath(`/halls/${hallId}/wallets`);
    return { ok: true, data: null };
  });
}

const reasonSchema = z.string().trim().min(3, "Enter at least 3 characters").max(300);

/** Freeze or unfreeze a wallet. Owners only (wallet.withdraw); a reason is always recorded. */
export async function setWalletStatusAction(
  hallId: string,
  walletId: string,
  frozen: boolean,
  reason: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "wallet.withdraw", async () => {
    if (!isUuid(walletId)) return invalid("reason", "Invalid request");
    const why = reasonSchema.safeParse(reason);
    if (!why.success) return invalid("reason", why.error.issues[0]?.message ?? "Enter a reason");
    const r = await callRpc<null>("set_wallet_status", {
      p_wallet_id: walletId,
      p_frozen: frozen,
      p_reason: why.data,
    });
    if (!r.ok) return r;
    revalidatePath(`/halls/${hallId}/wallets`);
    revalidatePath(`/halls/${hallId}/wallets/${walletId}`);
    return { ok: true, data: null };
  });
}

/** Cash withdrawal paid from the open shift. The amount is converted with the HALL's currency, server-side. */
export async function withdrawFromWalletAction(
  hallId: string,
  walletId: string,
  amountText: string,
  reason: string,
  idempotencyKey: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "wallet.withdraw", async () => {
    if (!isUuid(walletId) || !isUuid(idempotencyKey)) return invalid("amount", "Invalid request");
    const why = reasonSchema.safeParse(reason);
    if (!why.success) return invalid("reason", why.error.issues[0]?.message ?? "Enter a reason");
    const currency = await getHallCurrency(hallId);
    if (!currency) return fail("NOT_FOUND", "That hall could not be found.");
    const amount = parseMoneyForCurrency(amountText, currency);
    if (amount === null || amount <= 0) return invalid("amount", "Enter a valid amount.");
    const r = await callRpc<string>("withdraw_from_wallet", {
      p_wallet_id: walletId,
      p_amount_minor: amount,
      p_reason: why.data,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    revalidatePath(`/halls/${hallId}/wallets`);
    revalidatePath(`/halls/${hallId}/wallets/${walletId}`);
    revalidatePath(`/halls/${hallId}/shifts`);
    return { ok: true, data: null };
  });
}
