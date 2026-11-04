import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface ProductRow {
  id: string;
  name: string;
  priceMinor: number;
  active: boolean;
  currency: string;
}

export interface SessionItemRow {
  id: string;
  productId: string | null;
  name: string;
  unitPriceMinor: number;
  quantity: number;
  lineMinor: number;
  currency: string;
  addedByName: string | null;
  createdAt: string;
}

/** Managers get the whole catalog; sellers only the active products (the database decides). */
export async function listProducts(hallId: string): Promise<ProductRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_products", { p_hall_id: hallId });
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    priceMinor: Number(r.price_minor),
    active: Boolean(r.active),
    currency: String(r.currency).trim(),
  }));
}

export async function listSessionItems(sessionId: string): Promise<SessionItemRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_session_items", { p_session: sessionId });
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    productId: (r.product_id as string | null) ?? null,
    name: r.name as string,
    unitPriceMinor: Number(r.unit_price_minor),
    quantity: Number(r.quantity),
    lineMinor: Number(r.line_minor),
    currency: String(r.currency).trim(),
    addedByName: (r.added_by_name as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}
