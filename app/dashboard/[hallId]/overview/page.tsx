import { Suspense } from "react";
import type { Metadata } from "next";
import { getServerClient } from "@/lib/supabase/server";
import type { DeviceStatus } from "@/services/devices";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Monitor, CheckCircle2, Play, Clock, WifiOff, LayoutDashboard } from "lucide-react";

export const metadata: Metadata = { title: "Overview" };

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const RES_STATUS: Record<string, string> = {
  confirmed: "badge-confirmed", active: "badge-active",
  cancelled: "badge-cancelled", completed: "badge-completed",
};

async function OverviewContent({ hallId }: { hallId: string }) {
  const supabase = await getServerClient();

  // both queries in parallel
  const [devicesRes, reservationsRes] = await Promise.all([
    supabase.from("devices").select("id, status").eq("hall_id", hallId),
    supabase.from("reservations")
      .select("id, start_time, end_time, status, devices!inner(name, hall_id)")
      .eq("devices.hall_id", hallId)
      .order("start_time", { ascending: false })
      .limit(5),
  ]);

  const devices = devicesRes.data ?? [];
  const count = (s: DeviceStatus) => devices.filter(d => d.status === s).length;

  const stats = [
    { label: "Total",     value: devices.length,    color: "text-foreground",       icon: Monitor },
    { label: "Available", value: count("available"), color: "text-green-400",        icon: CheckCircle2 },
    { label: "Active",    value: count("active"),    color: "text-blue-400",         icon: Play },
    { label: "Reserved",  value: count("idle"),      color: "text-amber-400",        icon: Clock },
    { label: "Offline",   value: count("offline"),   color: "text-muted-foreground", icon: WifiOff },
  ];

  const rows = (reservationsRes.data ?? []) as unknown as {
    id: string; start_time: string; end_time: string; status: string;
    devices: { name: string } | null;
  }[];

  return (
    <>
      {/* stats */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(({ label, value, color, icon: Icon }) => (
          <Card key={label} className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">{label}</span>
                <Icon size={14} className="text-muted-foreground/40" />
              </div>
              <p className={`text-3xl font-bold leading-none tabular-nums ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* recent reservations */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recent Reservations</CardTitle>
        </CardHeader>
        <Separator className="opacity-40" />
        {rows.length === 0 ? (
          <CardContent className="py-10 text-center">
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
    </>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl skeleton-shimmer" />
        ))}
      </div>
      <Card className="border-border/60">
        <CardHeader><Skeleton className="h-4 w-40 skeleton-shimmer" /></CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-lg skeleton-shimmer" />
          ))}
        </CardContent>
      </Card>
    </>
  );
}

export default async function OverviewPage({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  return (
    <div className="page-shell">
      <div className="flex items-center gap-2.5">
        <LayoutDashboard size={18} className="text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold leading-none">Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Hall status at a glance</p>
        </div>
      </div>
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent hallId={hallId} />
      </Suspense>
    </div>
  );
}
