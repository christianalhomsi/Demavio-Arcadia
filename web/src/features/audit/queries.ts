import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface AuditEntry {
  id: string;
  createdAt: string;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
}

export async function listHallAudit(
  hallId: string,
  opts: { limit: number; offset: number; action?: string },
): Promise<{ entries: AuditEntry[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_hall_audit", {
    p_hall_id: hallId,
    p_limit: opts.limit,
    p_offset: opts.offset,
    p_action: opts.action ?? null,
  });
  if (error) return null;
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    entries: rows.map((r) => ({
      id: r.id as string,
      createdAt: r.created_at as string,
      actorName: r.actor_name as string | null,
      action: r.action as string,
      targetType: r.target_type as string | null,
      targetId: r.target_id as string | null,
      reason: r.reason as string | null,
      before: r.before_data,
      after: r.after_data,
    })),
  };
}
