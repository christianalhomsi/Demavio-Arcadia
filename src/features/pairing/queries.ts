import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface HallServerInfo {
  id: string;
  name: string;
  version: string | null;
  lastSeenAt: string | null;
  revoked: boolean;
  /** Seen within the last minute (the Hall Server polls the cloud every few seconds). */
  online: boolean;
}

const ONLINE_WINDOW_MS = 60_000;

/** Hall Servers of a hall. RLS limits this to members who can manage the hall; the token hash is not readable. */
export async function listHallServers(hallId: string): Promise<HallServerInfo[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hall_servers")
    .select("id, name, version, last_seen_at, revoked_at")
    .eq("hall_id", hallId)
    .order("created_at", { ascending: false });
  if (error || !data) return null;
  const now = Date.now();
  return data.map((r) => {
    const seen = r.last_seen_at ? Date.parse(r.last_seen_at) : null;
    return {
      id: r.id,
      name: r.name,
      version: r.version,
      lastSeenAt: r.last_seen_at,
      revoked: r.revoked_at !== null,
      online: r.revoked_at === null && seen !== null && now - seen < ONLINE_WINDOW_MS,
    };
  });
}
