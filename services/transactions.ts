import { getServerClient } from "@/lib/supabase/server";
import type { ServiceResult } from "@/types/reservation";
import type { FinancialTransaction, InsertTransactionInput } from "@/types/transaction";

export async function insertTransaction(
  input: InsertTransactionInput
): Promise<ServiceResult<FinancialTransaction>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("financial_transactions")
    .insert({
      type: input.type,
      amount: input.amount,
      created_by: input.created_by,
      reference_id: input.reference_id ?? null,
      reference_type: input.reference_type ?? null,
      note: input.note ?? null,
    })
    .select("id, type, amount, reference_id, reference_type, note, created_by, created_at")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}
