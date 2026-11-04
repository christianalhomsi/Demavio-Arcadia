import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionStatus } from "./schemas";

export interface SessionRow {
  id: string;
  deviceId: string;
  deviceName: string;
  customerName: string | null;
  type: "fixed" | "open";
  status: SessionStatus;
  startedAt: string;
  scheduledEndAt: string | null;
  endedAt: string | null;
  endType: string | null;
  billableSeconds: number | null;
  extensionCount: number;
  reservationId: string | null;
}

export async function listSessions(
  hallId: string,
  opts: { activeOnly: boolean; limit: number; offset: number; sessionId?: string },
): Promise<{ rows: SessionRow[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_sessions", {
    p_hall_id: hallId,
    p_active_only: opts.activeOnly,
    p_limit: opts.limit,
    p_offset: opts.offset,
    p_session_id: opts.sessionId ?? null,
  });
  if (error) return null;
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    rows: rows.map((r) => ({
      id: r.id as string,
      deviceId: r.device_id as string,
      deviceName: r.device_name as string,
      customerName: (r.customer_name as string | null) ?? null,
      type: r.session_type as SessionRow["type"],
      status: r.status as SessionStatus,
      startedAt: r.started_at as string,
      scheduledEndAt: (r.scheduled_end_at as string | null) ?? null,
      endedAt: (r.ended_at as string | null) ?? null,
      endType: (r.end_type as string | null) ?? null,
      billableSeconds: r.billable_seconds === null ? null : Number(r.billable_seconds),
      extensionCount: Number(r.extension_count),
      reservationId: (r.reservation_id as string | null) ?? null,
    })),
  };
}

export async function getServerNow(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("server_now");
  return typeof data === "string" ? data : new Date().toISOString();
}

export interface SessionEvent {
  id: string;
  type: string;
  at: string;
  reason: string | null;
  detail: Record<string, unknown> | null;
}

export async function getSession(hallId: string, id: string) {
  const supabase = await createClient();
  const [page, events] = await Promise.all([
    listSessions(hallId, { activeOnly: false, limit: 1, offset: 0, sessionId: id }),
    supabase
      .from("session_events")
      .select("id,event_type,created_at,reason,detail")
      .eq("session_id", id)
      .order("created_at"),
  ]);
  const row = page?.rows.find((s) => s.id === id);
  if (!row) return null;
  return {
    session: row,
    events: (events.data ?? []).map((e): SessionEvent => ({
      id: e.id,
      type: e.event_type,
      at: e.created_at,
      reason: e.reason,
      detail: e.detail,
    })),
  };
}
