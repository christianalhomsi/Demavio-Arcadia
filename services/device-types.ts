import { getServerClient } from "@/lib/supabase/server";
import type { DeviceType, HallDevice } from "@/types/device-type";

export async function getDeviceTypes(): Promise<DeviceType[]> {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("device_types")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getHallDevices(hallId: string): Promise<HallDevice[]> {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("hall_devices")
    .select(`
      *,
      device_type:device_types(*)
    `)
    .eq("hall_id", hallId);

  if (error) throw new Error(error.message);
  return data || [];
}
