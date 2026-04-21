import { getServerClient } from "@/lib/supabase/server";
import type { ServiceResult } from "@/types/reservation";
import type { Product, ProductInput } from "@/types/product";

export async function getHallProducts(
  hallId: string,
  activeOnly: boolean = false
): Promise<ServiceResult<Product[]>> {
  const supabase = await getServerClient();

  let query = supabase
    .from("products")
    .select("*")
    .eq("hall_id", hallId)
    .order("name", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Product[] };
}

export async function createProduct(
  hallId: string,
  input: ProductInput
): Promise<ServiceResult<Product>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("products")
    .insert({
      hall_id: hallId,
      name: input.name,
      price: input.price,
      is_active: input.is_active ?? true,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Product };
}

export async function updateProduct(
  productId: string,
  input: Partial<ProductInput>
): Promise<ServiceResult<Product>> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("products")
    .update(input)
    .eq("id", productId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Product };
}

export async function toggleProductActive(
  productId: string,
  isActive: boolean
): Promise<ServiceResult<Product>> {
  return updateProduct(productId, { is_active: isActive });
}
