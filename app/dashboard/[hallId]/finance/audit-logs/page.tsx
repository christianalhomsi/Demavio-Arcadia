import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import type { AuditLogEntry } from "@/types/audit";
import AuditLogsTable from "./audit-logs-table";

export const metadata: Metadata = { title: "Audit Logs | Gaming Hub" };

// ─── data fetching ────────────────────────────────────────────────────────────

async function getHallAuditLogs(hallId: string): Promise<AuditLogEntry[]> {
  const supabase = getServerClient();

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
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.5rem" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ ...skel, height: "32px", width: "120px" }} />
        ))}
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ ...skel, height: "44px" }} />
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
    <div style={page}>
      <div style={pageHeader}>
        <p style={pageHeading}>Audit logs</p>
        <Link href={`/dashboard/${params.hallId}/finance`} style={backLink}>
          ← Finance overview
        </Link>
      </div>

      <div style={card}>
        <Suspense fallback={<TableSkeleton />}>
          <AuditLogsLoader hallId={params.hallId} />
        </Suspense>
      </div>
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const page: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
  maxWidth: "960px",
};

const pageHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "1rem",
};

const pageHeading: React.CSSProperties = {
  margin: 0,
  fontSize: "1.25rem",
  fontWeight: 700,
  color: "#111827",
};

const backLink: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#6b7280",
  textDecoration: "none",
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  padding: "1.5rem",
};

const skel: React.CSSProperties = {
  borderRadius: "0.375rem",
  background: "#e5e7eb",
  width: "100%",
};
