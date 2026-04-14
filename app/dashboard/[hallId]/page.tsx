import { Suspense } from "react";
import type { Metadata } from "next";
import { getServerClient } from "@/lib/supabase/server";
import type { Device, DeviceStatus } from "@/services/devices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Overview" };

async function getHallDevices(hallId: string): Promise<Device[]> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("devices").select("id, hall_id, name, status, last_heartbeat")
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
  return (data ?? []) as unknown as RecentRow[];
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const RES_STATUS: Record<string, string> = {
  confirmed: "badge-confirmed",
  active:    "badge-active",
  cancelled: "badge-cancelled",
  completed: "badge-completed",
};

async function OverviewStats({ hallId }: { hallId: string }) {
  const devices = await getHallDevices(hallId);
  const count = (s: DeviceStatus) => devices.filter((d) => d.status === s).length;

  const stats = [
    { label: "Total",     value: devices.length,    color: "text-foreground",      icon: "⬡" },
    { label: "Available", value: count("available"), color: "text-green-400",       icon: "✓" },
    { label: "Active",    value: count("active"),    color: "text-blue-400",        icon: "▶" },
    { label: "Reserved",  value: count("idle"),      color: "text-amber-400",       icon: "⏳" },
    { label: "Offline",   value: count("offline"),   color: "text-muted-foreground", icon: "○" },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map(({ label, value, color, icon }) => (
        <Card key={label} className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs opacity-50">{icon}</span>
            </div>
            <p className={`text-3xl font-bold leading-none ${color}`}>{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-xl skeleton-shimmer" />
      ))}
    </div>
  );
}

async function RecentReservations({ hallId }: { hallId: string }) {
  const rows = await getRecentReservations(hallId);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Recent Reservations</CardTitle>
      </CardHeader>
      <Separator className="opacity-40" />
      {rows.length === 0 ? (
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No reservations yet.</p>
        </CardContent>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                {["Device", "Start", "End", "Status"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left section-heading">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="table-row-hover border-b border-border/20 last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{r.devices?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{fmt(r.start_time)}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{fmt(r.end_time)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RES_STATUS[r.status] ?? "badge-completed"}`}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RecentSkeleton() {
  return (
    <Card className="border-border/60">
      <CardHeader><Skeleton className="h-4 w-40 skeleton-shimmer" /></CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-lg skeleton-shimmer" />
        ))}
      </CardContent>
    </Card>
  );
}

export default async function OverviewPage({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  return (
    <div className="page-shell">
      <div>
        <h1 className="text-xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Hall status at a glance</p>
      </div>
      <Suspense fallback={<StatsSkeleton />}>
        <OverviewStats hallId={hallId} />
      </Suspense>
      <Suspense fallback={<RecentSkeleton />}>
        <RecentReservations hallId={hallId} />
      </Suspense>
    </div>
  );
}
