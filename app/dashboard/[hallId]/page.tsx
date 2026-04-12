import { Suspense } from "react";
import type { Metadata } from "next";
import { getServerClient } from "@/lib/supabase/server";
import type { Device, DeviceStatus } from "@/services/devices";

export const metadata: Metadata = { title: "Overview | Gaming Hub" };

async function getHallDevices(hallId: string): Promise<Device[]> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("devices")
    .select("id, hall_id, name, status, last_heartbeat")
    .eq("hall_id", hallId);
  return data ?? [];
}

type RecentRow = {
  id: string; start_time: string; end_time: string; status: string;
  devices: { name: string } | null;
};

async function getRecentReservations(hallId: string): Promise<RecentRow[]> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("reservations")
    .select("id, start_time, end_time, status, devices!inner(name, hall_id)")
    .eq("devices.hall_id", hallId)
    .order("start_time", { ascending: false })
    .limit(5);
  return (data ?? []) as RecentRow[];
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const RES_STATUS: Record<string, { bg: string; color: string }> = {
  confirmed: { bg: "#14532d33", color: "#22c55e" },
  active:    { bg: "#1e3a5f33", color: "#60a5fa" },
  cancelled: { bg: "#7f1d1d33", color: "#f87171" },
  completed: { bg: "#1f212833", color: "#6b7280" },
};

async function OverviewStats({ hallId }: { hallId: string }) {
  const devices = await getHallDevices(hallId);
  const count = (s: DeviceStatus) => devices.filter((d) => d.status === s).length;

  const stats = [
    { label: "Total",     value: devices.length,    color: "var(--color-text)" },
    { label: "Available", value: count("available"), color: "#22c55e" },
    { label: "Active",    value: count("active"),    color: "#60a5fa" },
    { label: "Reserved",  value: count("idle"),      color: "#f59e0b" },
    { label: "Offline",   value: count("offline"),   color: "var(--color-muted)" },
  ];

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
      {stats.map(({ label, value, color }) => (
        <div key={label} className="flex flex-col gap-1 p-4 rounded-xl border"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
          <span className="text-3xl font-bold leading-none" style={{ color }}>{value}</span>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton h-24 rounded-xl" style={{ background: "var(--color-surface)" }} />
      ))}
    </div>
  );
}

async function RecentReservations({ hallId }: { hallId: string }) {
  const rows = await getRecentReservations(hallId);

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <div className="px-5 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Recent reservations</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm" style={{ color: "var(--color-muted)" }}>No reservations yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Device", "Start", "End", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--color-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = RES_STATUS[r.status] ?? RES_STATUS.completed;
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="px-4 py-3" style={{ color: "var(--color-text)" }}>{r.devices?.name ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--color-muted)" }}>{fmt(r.start_time)}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--color-muted)" }}>{fmt(r.end_time)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full"
                        style={{ background: s.bg, color: s.color }}>
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

function RecentSkeleton() {
  return (
    <div className="rounded-xl border p-5 flex flex-col gap-3"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <div className="skeleton h-4 w-40 rounded" style={{ background: "var(--color-surface-2)" }} />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-11 rounded-lg" style={{ background: "var(--color-surface-2)" }} />
      ))}
    </div>
  );
}

export default function OverviewPage({ params }: { params: { hallId: string } }) {
  const { hallId } = params;
  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Overview</h1>
      <Suspense fallback={<StatsSkeleton />}>
        <OverviewStats hallId={hallId} />
      </Suspense>
      <Suspense fallback={<RecentSkeleton />}>
        <RecentReservations hallId={hallId} />
      </Suspense>
    </div>
  );
}
