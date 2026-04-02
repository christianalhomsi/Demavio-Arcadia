import { getAdminClient } from "@/lib/supabase/admin";

const DEFAULT_HEARTBEAT_TIMEOUT_MINUTES = 5;

export type MarkOfflineResult = {
  offline_count: number;
  offline_ids: string[];
};

export async function markOfflineDevices(
  timeoutMinutes = DEFAULT_HEARTBEAT_TIMEOUT_MINUTES
): Promise<MarkOfflineResult> {
  const supabase = getAdminClient();
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

  // Single bulk UPDATE — idempotent because:
  // 1. .neq("status", "offline") skips already-offline devices
  // 2. .lt("last_heartbeat", cutoff) is a stable condition — re-running
  //    produces the same result until a device sends a new heartbeat
  const { data, error } = await supabase
    .from("devices")
    .update({ status: "offline" })
    .neq("status", "offline")
    .lt("last_heartbeat", cutoff)
    .select("id");

  if (error) throw new Error(`markOfflineDevices failed: ${error.message}`);

  const offline_ids = (data ?? []).map((d: { id: string }) => d.id);

  return {
    offline_count: offline_ids.length,
    offline_ids,
  };
}
