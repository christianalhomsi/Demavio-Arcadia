import { getServerClient } from "@/lib/supabase/server";
import type { ServiceResult } from "@/types/reservation";
import type { SessionItem, SessionItemInput } from "@/types/session-item";

export async function getSessionItems(
  sessionId: string
): Promise<ServiceResult<SessionItem[]>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("session_items")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as SessionItem[] };
}

export async function addSessionItem(
  input: SessionItemInput
): Promise<ServiceResult<SessionItem>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("session_items")
    .insert({
      session_id: input.session_id,
      product_id: input.product_id ?? null,
      product_name: input.product_name,
      product_price: input.product_price,
      quantity: input.quantity,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as SessionItem };
}

export async function removeSessionItem(
  itemId: string
): Promise<ServiceResult<true>> {
  const supabase = await getServerClient();

  const { error } = await supabase
    .from("session_items")
    .delete()
    .eq("id", itemId);

  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}

export async function calculateSessionTotal(
  sessionId: string
): Promise<ServiceResult<{ items_total: number; items: SessionItem[] }>> {
  const itemsResult = await getSessionItems(sessionId);
  
  if (!itemsResult.success) {
    return { success: false, error: itemsResult.error };
  }

  const items = itemsResult.data;
  const items_total = items.reduce(
    (sum, item) => sum + item.product_price * item.quantity,
    0
  );

  return { success: true, data: { items_total, items } };
}
