import { getServerClient } from "@/lib/supabase/server";
import type { Hall } from "@/types/hall";

export async function getHalls(): Promise<Hall[]> {
  const supabase = getServerClient();

  const { data, error } = await supabase
    .from("halls")
    .select("id, name, capacity, location, is_active, created_at")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}
