import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Reservations | Gaming Hub" };

type ReservationRow = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  devices: {
    name: string;
    halls: { name: string } | null;
  } | null;
};

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  confirmed: { background: "#dcfce7", color: "#15803d" },
  active:    { background: "#dbeafe", color: "#1d4ed8" },
  cancelled: { background: "#fee2e2", color: "#b91c1c" },
  completed: { background: "#f3f4f6", color: "#6b7280" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function ReservationsList() {
  const supabase = getServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("reservations")
    .select("id, start_time, end_time, status, devices(name, halls(name))")
    .eq("user_id", user.id)
    .order("start_time", { ascending: false });

  if (error) {
    return (
      <p style={{ color: "#b91c1c", fontSize: "0.875rem" }}>
        Failed to load reservations. Please try again.
      </p>
    );
  }

  const rows = (data ?? []) as ReservationRow[];

  if (rows.length === 0) {
    return (
      <div style={emptyWrap}>
        <p style={{ margin: "0 0 1rem", color: "#6b7280", fontSize: "0.875rem" }}>
          You have no reservations yet.
        </p>
        <Link href="/reservations/new" style={newBtn}>
          Book a device
        </Link>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={table}>
        <thead>
          <tr>
            {["Hall", "Device", "Start", "End", "Status"].map((h) => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const badge = STATUS_STYLE[r.status] ?? STATUS_STYLE.completed;
            return (
              <tr key={r.id} style={tr}>
                <td style={td}>{r.devices?.halls?.name ?? "—"}</td>
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
  );
}

function ReservationsListSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={skelRow} />
      ))}
    </div>
  );
}

export default function ReservationsPage() {
  return (
    <div style={page}>
      <div style={pageHeader}>
        <h1 style={heading}>My reservations</h1>
        <Link href="/reservations/new" style={newBtn}>+ New</Link>
      </div>
      <Suspense fallback={<ReservationsListSkeleton />}>
        <ReservationsList />
      </Suspense>
    </div>
  );
}

const page: React.CSSProperties = {
  padding: "2rem",
  maxWidth: "900px",
  margin: "0 auto",
  fontFamily: "system-ui, sans-serif",
};

const pageHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "1.5rem",
};

const heading: React.CSSProperties = {
  margin: 0,
  fontSize: "1.5rem",
  fontWeight: 700,
  color: "#111827",
};

const newBtn: React.CSSProperties = {
  padding: "0.4rem 0.875rem",
  borderRadius: "0.375rem",
  background: "#111827",
  color: "#fff",
  fontSize: "0.875rem",
  fontWeight: 500,
  textDecoration: "none",
};

const emptyWrap: React.CSSProperties = {
  padding: "2rem",
  textAlign: "center",
  background: "#fff",
  borderRadius: "0.75rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.875rem",
  background: "#fff",
  borderRadius: "0.75rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  overflow: "hidden",
};

const th: React.CSSProperties = {
  padding: "0.75rem 1rem",
  textAlign: "left",
  fontWeight: 600,
  color: "#374151",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};

const tr: React.CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
};

const td: React.CSSProperties = {
  padding: "0.75rem 1rem",
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

const skelRow: React.CSSProperties = {
  height: "48px",
  borderRadius: "0.5rem",
  background: "#e5e7eb",
};
