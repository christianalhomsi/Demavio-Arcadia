import "server-only";
import { createClient } from "@/lib/supabase/server";

export const EXPENSE_CATEGORIES = [
  "rent",
  "electricity",
  "internet",
  "supplies",
  "salaries",
  "maintenance",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const PAID_WITH = ["cash", "bank", "other"] as const;
export type PaidWith = (typeof PAID_WITH)[number];

export interface ExpenseRow {
  id: string;
  category: ExpenseCategory;
  amountMinor: number;
  currency: string;
  spentOn: string;
  paidWith: PaidWith;
  description: string | null;
  hasReceipt: boolean;
  status: "recorded" | "voided";
  voidReason: string | null;
  createdByName: string | null;
  createdAt: string;
}

export async function listExpenses(
  hallId: string,
  opts: { limit: number; offset: number },
): Promise<{ rows: ExpenseRow[]; total: number; totalAmountMinor: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_expenses", {
    p_hall_id: hallId,
    p_limit: opts.limit,
    p_offset: opts.offset,
  });
  if (error) return null;
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    totalAmountMinor: rows[0] ? Number(rows[0].total_amount_minor) : 0,
    rows: rows.map((r) => ({
      id: r.id as string,
      category: r.category as ExpenseCategory,
      amountMinor: Number(r.amount_minor),
      currency: String(r.currency).trim(),
      spentOn: r.spent_on as string,
      paidWith: r.paid_with as PaidWith,
      description: (r.description as string | null) ?? null,
      hasReceipt: Boolean(r.has_receipt),
      status: r.status as ExpenseRow["status"],
      voidReason: (r.void_reason as string | null) ?? null,
      createdByName: (r.created_by_name as string | null) ?? null,
      createdAt: r.created_at as string,
    })),
  };
}
