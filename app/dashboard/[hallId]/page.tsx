import { Suspense } from "react";
import type { Metadata } from "next";
import { getServerClient } from "@/lib/supabase/server";
import type { Device, DeviceStatus } from "@/services/devices";

export const metadata: Metadata = { title: "Overview | Gaming Hub" };

// ─── data ────────────────────────────────────────────────────────────────────

async function getHallDevices(hallId: string): Promise<Device[]> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from("devices")
    .select("id, hall_id, name, status, last_heartbeat")
    .eq("hall_id", hallId);
  return data ?? [];
}

type RecentRow = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  devices: { name: string } | null;
};

async function getRecentReservations(hallId: string): Promise<RecentRow[]> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from("reservations")
    .select("id, start_time, end_time, status, devices!inner(name, hall_id)")
    .eq("devices.hall_id", hallId)
    .order("start_time", { ascending: false })
    .limit(5);
  return (data ?? []) as RecentRow[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const RESERVATION_STATUS_STYLE: Record<string, React.CSSProperties> = {
  confirmed: { background: "#dcfce7", color: "#15803d" },
  active:    { background: "#dbeafe", color: "#1d4ed8" },
  cancelled: { background: "#fee2e2", color: "#b91c1c" },
  completed: { background: "#f3f4f6", color: "#6b7280" },
};

// ─── stat cards ──────────────────────────────────────────────────────────────

async function OverviewStats({ hallId }: { hallId: string }) {
  const devices = await getHallDevices(hallId);

  const count = (s: DeviceStatus) => devices.filter((d) => d.status === s).length;

  const stats = [
    { label: "Total devices",     value: devices.length,       accent: "#111827" },
    { label: "Available",         value: count("available"),   accent: "#15803d" },
    { label: "Active",            value: count("active"),      accent: "#1d4ed8" },
    { label: "Reserved",          value: count("idle"),        accent: "#a16207" },
    { label: "Offline",           value: count("offline"),     accent: "#6b7280" },
  ];

  return (
    <div style={statsGrid}>
      {stats.map(({ label, value, accent }) => (
        <div key={label} style={statCard}>
          <span style={{ ...statValue, color: accent }}>{value}</span>
          <span style={statLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div style={statsGrid}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ ...statCard, gap: "0.5rem" }}>
          <div style={{ ...skel, height: "2rem", width: "3rem" }} />
          <div style={{ ...skel, height: "0.875rem", width: "5rem" }} />
        </div>
      ))}
    </div>
  );
}

// ─── recent reservations ─────────────────────────────────────────────────────

async function RecentReservations({ hallId }: { hallId: string }) {
  const rows = await getRecentReservations(hallId);

  return (
    <div style={section}>
      <p style={sectionHeading}>Recent reservations</p>
      {rows.length === 0 ? (
        <p style={empty}>No reservations yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                {["Device", "Start", "End", "Status"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge =
                  RESERVATION_STATUS_STYLE[r.status] ??
                  RESERVATION_STATUS_STYLE.completed;
                return (
                  <tr key={r.id} style={tableRow}>
                    <td style={td}>{r.devices?.name ?? "—"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{fmt(r.start_time)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{fmt(r.end_time)}</td>
                    <td style={td}>
                      <span style={{ ...badgeBase, ...badge }}>
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecentReservationsSkeleton() {
  return (
    <div style={section}>
      <div style={{ ...skel, height: "1rem", width: "160px", marginBottom: "1rem" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ ...skel, height: "44px" }} />
        ))}
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function OverviewPage({
  params,
}: {
  params: { hallId: string };
}) {
  const { hallId } = params;

  return (
    <div style={page}>
      <p style={pageHeading}>Overview</p>

      <Suspense fallback={<StatsSkeleton />}>
        <OverviewStats hallId={hallId} />
      </Suspense>

      <Suspense fallback={<RecentReservationsSkeleton />}>
        <RecentReservations hallId={hallId} />
      </Suspense>
    </div>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const page: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2rem",
  maxWidth: "900px",
};

const pageHeading: React.CSSProperties = {
  margin: 0,
  fontSize: "1.25rem",
  fontWeight: 700,
  color: "#111827",
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: "1rem",
};

const statCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  padding: "1.25rem 1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.375rem",
};

const statValue: React.CSSProperties = {
  fontSize: "1.75rem",
  fontWeight: 700,
  lineHeight: 1,
};

const statLabel: React.CSSProperties = {
  fontSize: "0.8125rem",
  color: "#6b7280",
};

const section: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
  padding: "1.5rem",
};

const sectionHeading: React.CSSProperties = {
  margin: "0 0 1rem",
  fontSize: "0.9375rem",
  fontWeight: 600,
  color: "#111827",
};

const empty: React.CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  color: "#6b7280",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.875rem",
};

const th: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  textAlign: "left",
  fontWeight: 600,
  color: "#374151",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tableRow: React.CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
};

const td: React.CSSProperties = {
  padding: "0.625rem 0.75rem",
  color: "#111827",
  verticalAlign: "middle",
};

const badgeBase: React.CSSProperties = {
  display: "inline-block",
  fontSize: "0.75rem",
  fontWeight: 500,
  padding: "0.2rem 0.6rem",
  borderRadius: "9999px",
};

const skel: React.CSSProperties = {
  borderRadius: "0.375rem",
  background: "#e5e7eb",
};
