import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import type { AuditLogEntry } from "@/types/audit";
import AuditLogsTable from "./audit-logs-table";

export const metadata: Metadata = { title: "Audit Logs | Arcadia" };

// ─── data fetching ────────────────────────────────────────────────────────────

async function getHallAuditLogs(hallId: string): Promise<AuditLogEntry[]> {
  const supabase = await getServerClient();

  // Collect entity IDs relevant to this hall:
  // the hall itself + all its device IDs
  const { data: deviceData } = await supabase
    .from("devices")
    .select("id")
    .eq("hall_id", hallId);

  const deviceIds = ((deviceData ?? []) as { id: string }[]).map((d) => d.id);
  const entityIds = [hallId, ...deviceIds];

  const { data } = await supabase
    .from("audit_logs")
    .select("id, user_id, action, entity_type, entity_id, old_data, new_data, created_at")
    .in("entity_id", entityIds)
    .order("created_at", { ascending: false })
    .limit(200);

  return (data ?? []) as AuditLogEntry[];
}

// ─── inner async component ────────────────────────────────────────────────────

async function AuditLogsLoader({ hallId }: { hallId: string }) {
  const rows = await getHallAuditLogs(hallId);
  return <AuditLogsTable rows={rows} />;
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3 mb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-28 rounded-lg skeleton-shimmer" />
        ))}
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-11 rounded-lg skeleton-shimmer" />
      ))}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function AuditLogsPage({
  params,
}: {
  params: { hallId: string };
}) {
  return (
    <div className="page-shell">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Audit Logs</h1>
        <Link href={`/dashboard/${params.hallId}/finance`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted">
          ← Finance overview
        </Link>
      </div>
      <div className="rounded-2xl border border-border/50 bg-card p-5">
        <Suspense fallback={<TableSkeleton />}>
          <AuditLogsLoader hallId={params.hallId} />
        </Suspense>
      </div>
    </div>
  );
}

