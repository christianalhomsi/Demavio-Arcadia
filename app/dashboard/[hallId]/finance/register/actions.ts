"use server";

import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/supabase/server";
import { openCashRegister, closeCashRegister } from "@/services/cash-registers";

export async function openRegisterAction(
  hallId: string,
  openingBalance: number
): Promise<{ error?: string }> {
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const result = await openCashRegister({
    hall_id: hallId,
    opened_by: user.id,
    opening_balance: openingBalance,
  });

  if (!result.success) return { error: result.error };

  revalidatePath(`/dashboard/${hallId}/finance/register`);
  return {};
}

export async function closeRegisterAction(
  registerId: string,
  hallId: string,
  actualBalance: number
): Promise<{ error?: string }> {
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Compute total_income from payments scoped to this hall
  const { data: paymentData } = await supabase
    .from("payments")
    .select("amount, sessions!inner(device_id, devices!inner(hall_id))")
    .eq("sessions.devices.hall_id", hallId);

  const totalIncome = ((paymentData ?? []) as { amount: number }[]).reduce(
    (sum, p) => sum + p.amount,
    0
  );

  const result = await closeCashRegister({
    register_id: registerId,
    closed_by: user.id,
    actual_balance: actualBalance,
    total_income: totalIncome,
    total_outflows: 0,
  });

  if (!result.success) return { error: result.error };

  revalidatePath(`/dashboard/${hallId}/finance/register`);
  return {};
}
