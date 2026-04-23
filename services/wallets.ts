import { getServerClient } from "@/lib/supabase/server";
import type { ServiceResult } from "@/types/reservation";
import type { PlayerWallet, WalletTransaction, WalletWithBalance } from "@/types/wallet";

export async function getOrCreateWallet(
  hallId: string,
  userId: string | null,
  guestName: string | null
): Promise<ServiceResult<PlayerWallet>> {
  const supabase = await getServerClient();

  // Try to find existing wallet
  let query = supabase
    .from("player_wallets")
    .select("*")
    .eq("hall_id", hallId);

  if (userId) {
    query = query.eq("user_id", userId).is("guest_name", null);
  } else if (guestName) {
    query = query.is("user_id", null).eq("guest_name", guestName);
  } else {
    return { success: false, error: "Either user_id or guest_name required" };
  }

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    return { success: true, data: existing };
  }

  // Create new wallet
  const { data, error } = await supabase
    .from("player_wallets")
    .insert({ hall_id: hallId, user_id: userId, guest_name: guestName })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getWalletBalance(walletId: string): Promise<ServiceResult<number>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase.rpc("get_wallet_balance", {
    wallet_uuid: walletId,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, data: parseFloat(data || "0") };
}

export async function getWalletWithBalance(
  hallId: string,
  userId: string | null,
  guestName: string | null
): Promise<ServiceResult<WalletWithBalance | null>> {
  const walletResult = await getOrCreateWallet(hallId, userId, guestName);
  if (!walletResult.success) return walletResult;

  const balanceResult = await getWalletBalance(walletResult.data.id);
  if (!balanceResult.success) return balanceResult;

  return {
    success: true,
    data: { ...walletResult.data, balance: balanceResult.data },
  };
}

export async function addWalletTopUp(
  walletId: string,
  amount: number,
  addedBy: string,
  note?: string
): Promise<ServiceResult<WalletTransaction>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("wallet_transactions")
    .insert({
      wallet_id: walletId,
      amount,
      type: "top_up",
      added_by: addedBy,
      note,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function deductFromWallet(
  walletId: string,
  amount: number,
  sessionId: string,
  addedBy: string | null
): Promise<ServiceResult<WalletTransaction>> {
  const supabase = await getServerClient();

  // Check balance first
  const balanceResult = await getWalletBalance(walletId);
  if (!balanceResult.success) return balanceResult;

  if (balanceResult.data < amount) {
    return { success: false, error: "Insufficient wallet balance" };
  }

  const { data, error } = await supabase
    .from("wallet_transactions")
    .insert({
      wallet_id: walletId,
      amount,
      type: "deduction",
      session_id: sessionId,
      added_by: addedBy,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getWalletTransactions(
  walletId: string
): Promise<ServiceResult<WalletTransaction[]>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("*")
    .eq("wallet_id", walletId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data || [] };
}
