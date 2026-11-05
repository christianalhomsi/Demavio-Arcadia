import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface MyActivityEntry {
  id: string;
  createdAt: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
}

/** The caller's own audit entries in one hall. The database filters by the signed-in user. */
export async function listMyActivity(
  hallId: string,
  opts: { limit: number; offset: number },
): Promise<{ entries: MyActivityEntry[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_activity", {
    p_hall_id: hallId,
    p_limit: opts.limit,
    p_offset: opts.offset,
  });
  if (error) return null;
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    entries: rows.map((r) => ({
      id: r.id as string,
      createdAt: r.created_at as string,
      action: r.action as string,
      targetType: (r.target_type as string | null) ?? null,
      targetId: (r.target_id as string | null) ?? null,
      reason: (r.reason as string | null) ?? null,
    })),
  };
}
