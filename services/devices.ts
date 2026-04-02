import { getServerClient } from "@/lib/supabase/server";
import type { ServiceResult } from "@/types/reservation";

export type DeviceStatus = "active" | "available" | "offline" | "idle";

export type Device = {
  id: string;
  hall_id: string;
  name: string;
  status: DeviceStatus;
  last_heartbeat: string | null;
};

export async function getDevice(deviceId: string): Promise<ServiceResult<Device>> {
  const supabase = getServerClient();

  const { data, error } = await supabase
    .from("devices")
    .select("id, hall_id, name, status, last_heartbeat")
    .eq("id", deviceId)
    .neq("status", "offline")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function setDeviceActive(
  deviceId: string
): Promise<ServiceResult<true>> {
  const supabase = getServerClient();

  const { error } = await supabase
    .from("devices")
    .update({ status: "active" })
    .eq("id", deviceId);

  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}

export async function setDeviceAvailable(
  deviceId: string
): Promise<ServiceResult<true>> {
  const supabase = getServerClient();

  const { error } = await supabase
    .from("devices")
    .update({ status: "available" })
    .eq("id", deviceId);

  if (error) return { success: false, error: error.message };
  return { success: true, data: true };
}
