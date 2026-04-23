import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { LayoutDashboard } from "lucide-react";
import OverviewDeviceCard from "@/components/ui/overview-device-card";

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
  const t = await getTranslations("dashboard");

  // all queries in parallel
  const [devicesRes, reservationsRes, sessionsRes] = await Promise.all([
    supabase.from("devices").select("id, name, status").eq("hall_id", hallId).order("name", { ascending: true }),
    supabase.from("reservations")
      .select("id, start_time, end_time, status, devices!inner(name, hall_id)")
      .eq("devices.hall_id", hallId)
      .order("start_time", { ascending: false })
      .limit(5),
    supabase.from("sessions").select("id, device_id, started_at, user_id, reservations!inner(guest_name)").is("ended_at", null).eq("hall_id", hallId),
  ]);

  const devices = devicesRes.data ?? [];
  const sessions = (sessionsRes.data ?? []) as unknown as {
    id: string;
    device_id: string;
    started_at: string;
    user_id: string | null;
    reservations: { guest_name: string | null } | null;
  }[];
  const sessionByDevice = new Map(sessions.map((s) => [s.device_id, {
    id: s.id,
    started_at: s.started_at,
    user_id: s.user_id,
    guest_name: s.reservations?.guest_name ?? null,
  }]));

  const rows = (reservationsRes.data ?? []) as unknown as {
    id: string; start_time: string; end_time: string; status: string;
    devices: { name: string } | null;
  }[];

  return (
    <>
      {/* devices grid */}
      {devices.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">{t("devices")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {devices.map((device) => (
              <OverviewDeviceCard
                key={device.id}
                id={device.id}
                name={device.name}
                status={device.status}
                hallId={hallId}
                activeSession={sessionByDevice.get(device.id) ? {
                  id: sessionByDevice.get(device.id)!.id,
                  started_at: sessionByDevice.get(device.id)!.started_at,
                  user_id: sessionByDevice.get(device.id)!.user_id,
                  guest_name: sessionByDevice.get(device.id)!.guest_name,
                } : null}
              />
            ))}
          </div>
        </div>
      )}

      {/* recent reservations */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <h2 className="text-sm font-semibold text-muted-foreground">{t("recentReservations")}</h2>
        </CardHeader>
        <Separator className="opacity-40" />
        {rows.length === 0 ? (
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">{t("noReservations")}</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto" dir="auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  {[t("device"), t("start"), t("end"), t("status")].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-start section-heading">{h}</th>
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
                        {t(r.status as any)}
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
      <div className="mb-6">
        <Skeleton className="h-4 w-24 mb-3 skeleton-shimmer" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl skeleton-shimmer" />
          ))}
        </div>
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
  const t = await getTranslations("dashboard");
  return (
    <div className="page-shell">
      <div className="flex items-center gap-2.5">
        <LayoutDashboard size={18} className="text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold leading-none">{t("overview")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("hallStatusGlance")}</p>
        </div>
      </div>
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent hallId={hallId} />
      </Suspense>
    </div>
  );
}
