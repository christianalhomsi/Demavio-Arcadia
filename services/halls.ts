import { getServerClient } from "@/lib/supabase/server";
import type { Hall } from "@/types/hall";

export async function getHalls(): Promise<Hall[]> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("halls")
    .select("id, name, address, working_hours, created_at")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function getHall(hallId: string): Promise<Hall | null> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("halls")
    .select("id, name, address, working_hours, created_at")
    .eq("id", hallId)
    .single();

  if (error) return null;
  return data;
}
