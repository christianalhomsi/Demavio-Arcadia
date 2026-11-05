"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import { isUuid } from "@/lib/auth/authorize";
import { parseMoneyForCurrency } from "@/lib/money";
import { dateToIso } from "@/lib/timeOfDay";
import { createClient } from "@/lib/supabase/server";
import { getHallCurrency } from "@/features/invoices/queries";

const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
const RECEIPT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const expenseSchema = z.object({
  category: z.enum([
    "rent",
    "electricity",
    "internet",
    "supplies",
    "salaries",
    "maintenance",
    "other",
  ]),
  /** Typed amount, converted to minor units on the server. */
  amountText: z.string().trim().min(1, "Enter an amount").max(20),
  /** "YYYY-MM-DD". */
  spentOn: z.string().max(10),
  paidWith: z.enum(["cash", "bank", "other"]),
  description: z.string().trim().max(300, "At most 300 characters"),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

async function parse(hallId: string, input: ExpenseInput) {
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: invalid(String(i?.path[0] ?? "amountText"), i?.message ?? "Invalid input") };
  }
  const d = parsed.data;
  if (dateToIso(d.spentOn) === null) return { error: invalid("spentOn", "Enter a valid date.") };
  const currency = await getHallCurrency(hallId);
  if (!currency) return { error: fail("NOT_FOUND", "That hall could not be found.") };
  const amount = parseMoneyForCurrency(d.amountText, currency);
  if (amount === null || amount <= 0)
    return { error: invalid("amountText", "Enter a valid amount.") };
  return { error: undefined, d, amount };
}

function refresh(hallId: string) {
  revalidatePath(`/halls/${hallId}/expenses`);
  revalidatePath(`/halls/${hallId}/reports`);
}

export async function createExpenseAction(
  hallId: string,
  input: ExpenseInput,
  idempotencyKey: string,
): Promise<ActionResult<{ id: string }>> {
  return withPermission(hallId, "expense.manage", async () => {
    if (!isUuid(idempotencyKey)) return invalid("amountText", "Invalid request");
    const p = await parse(hallId, input);
    if (p.error) return p.error;
    const r = await callRpc<string>("create_expense", {
      p_hall_id: hallId,
      p_category: p.d.category,
      p_amount_minor: p.amount,
      p_spent_on: p.d.spentOn,
      p_paid_with: p.d.paidWith,
      p_description: p.d.description || null,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    refresh(hallId);
    return { ok: true, data: { id: r.data } };
  });
}

export async function updateExpenseAction(
  hallId: string,
  expenseId: string,
  input: ExpenseInput,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "expense.manage", async () => {
    if (!isUuid(expenseId)) return invalid("amountText", "Invalid request");
    const p = await parse(hallId, input);
    if (p.error) return p.error;
    const r = await callRpc<null>("update_expense", {
      p_id: expenseId,
      p_category: p.d.category,
      p_amount_minor: p.amount,
      p_spent_on: p.d.spentOn,
      p_paid_with: p.d.paidWith,
      p_description: p.d.description || null,
    });
    if (!r.ok) return r;
    refresh(hallId);
    return { ok: true, data: null };
  });
}

export async function voidExpenseAction(
  hallId: string,
  expenseId: string,
  reason: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "expense.manage", async () => {
    if (!isUuid(expenseId)) return invalid("reason", "Invalid request");
    const why = z.string().trim().min(3, "Enter at least 3 characters").max(300).safeParse(reason);
    if (!why.success) return invalid("reason", why.error.issues[0]?.message ?? "Enter a reason");
    const r = await callRpc<null>("void_expense", { p_id: expenseId, p_reason: why.data });
    if (!r.ok) return r;
    refresh(hallId);
    return { ok: true, data: null };
  });
}

/**
 * Uploads a receipt to the private bucket as the signed-in user (Storage policies check the hall),
 * then links it to the expense. Type and size are checked here and again by the bucket itself.
 */
export async function uploadReceiptAction(
  hallId: string,
  expenseId: string,
  form: FormData,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "expense.manage", async () => {
    if (!isUuid(expenseId)) return invalid("file", "Invalid request");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return invalid("file", "Choose a file.");
    const ext = RECEIPT_TYPES[file.type];
    if (!ext || file.size > RECEIPT_MAX_BYTES)
      return invalid("file", "Choose a JPG, PNG, WebP or PDF file of up to 5 MB.");

    const path = `${hallId}/${expenseId}/${crypto.randomUUID()}.${ext}`;
    const supabase = await createClient();
    const up = await supabase.storage.from("receipts").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (up.error) return fail("UNKNOWN", "The receipt could not be uploaded. Please try again.");

    const r = await callRpc<null>("attach_expense_receipt", { p_id: expenseId, p_path: path });
    if (!r.ok) {
      await supabase.storage.from("receipts").remove([path]);
      return r;
    }
    refresh(hallId);
    return { ok: true, data: null };
  });
}

/** A link that works for one minute. The path is read from the database, never taken from the browser. */
export async function getReceiptUrlAction(
  hallId: string,
  expenseId: string,
): Promise<ActionResult<{ url: string }>> {
  return withPermission(hallId, "expense.manage", async () => {
    if (!isUuid(expenseId)) return invalid("file", "Invalid request");
    const p = await callRpc<string | null>("get_expense_receipt_path", { p_id: expenseId });
    if (!p.ok) return p;
    if (!p.data) return fail("NOT_FOUND", "This expense has no receipt.");
    const supabase = await createClient();
    const s = await supabase.storage.from("receipts").createSignedUrl(p.data, 60);
    if (s.error || !s.data) return fail("UNKNOWN", "The receipt could not be opened.");
    return { ok: true, data: { url: s.data.signedUrl } };
  });
}
