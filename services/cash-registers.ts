import { getServerClient } from "@/lib/supabase/server";
import type { ServiceResult } from "@/types/reservation";
import type {
  CashRegister,
  CashRegisterSummary,
  CloseCashRegisterInput,
  OpenCashRegisterInput,
} from "@/types/cash-register";
import {
  calculateExpectedBalance,
  calculateVariance,
} from "@/lib/cash-register";

export async function openCashRegister(
  input: OpenCashRegisterInput
): Promise<ServiceResult<CashRegister>> {
  const supabase = getServerClient();

  const { data, error } = await supabase
    .from("cash_registers")
    .insert({
      hall_id: input.hall_id,
      opened_by: input.opened_by,
      opening_balance: input.opening_balance,
      status: "open",
      opened_at: new Date().toISOString(),
    })
    .select("id, hall_id, opened_by, opening_balance, status, opened_at, closed_at")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getCashRegister(
  registerId: string
): Promise<ServiceResult<CashRegister>> {
  const supabase = getServerClient();

  const { data, error } = await supabase
    .from("cash_registers")
    .select("id, hall_id, opened_by, opening_balance, status, opened_at, closed_at")
    .eq("id", registerId)
    .eq("status", "open")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function closeCashRegister(
  input: CloseCashRegisterInput
): Promise<ServiceResult<CashRegisterSummary>> {
  const registerResult = await getCashRegister(input.register_id);
  if (!registerResult.success) return registerResult;

  const expectedBalance = calculateExpectedBalance(
    registerResult.data.opening_balance,
    input.total_income,
    input.total_outflows
  );

  const variance = calculateVariance(input.actual_balance, expectedBalance);
  const closedAt = new Date().toISOString();

  const supabase = getServerClient();

  const { data, error } = await supabase
    .from("cash_registers")
    .update({
      status: "closed",
      closed_by: input.closed_by,
      closed_at: closedAt,
      actual_balance: input.actual_balance,
      expected_balance: expectedBalance,
      variance,
    })
    .eq("id", input.register_id)
    .eq("status", "open")
    .select(
      "id, hall_id, opened_by, opening_balance, status, opened_at, closed_at, closed_by, actual_balance, expected_balance, variance"
    )
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}
