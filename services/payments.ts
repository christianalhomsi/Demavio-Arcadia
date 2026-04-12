import { getServerClient } from "@/lib/supabase/server";
import type { ServiceResult } from "@/types/reservation";

export type Payment = {
  id: string;
  session_id: string;
  user_id: string;
  amount: number;
  duration_hours: number;
  created_at: string;
};

export type LedgerEntry = {
  id: string;
  payment_id: string;
  amount: number;
  type: string;
  created_at: string;
};

export async function createPayment(
  sessionId: string,
  userId: string,
  amount: number,
  durationHours: number
): Promise<ServiceResult<Payment>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("payments")
    .insert({
      session_id: sessionId,
      user_id: userId,
      amount,
      duration_hours: durationHours,
    })
    .select("id, session_id, user_id, amount, duration_hours, created_at")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function createLedgerEntry(
  paymentId: string,
  amount: number
): Promise<ServiceResult<LedgerEntry>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("ledger")
    .insert({
      payment_id: paymentId,
      amount,
      type: "session_charge",
    })
    .select("id, payment_id, amount, type, created_at")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}
