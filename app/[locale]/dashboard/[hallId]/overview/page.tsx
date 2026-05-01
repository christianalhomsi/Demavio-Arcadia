import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { LayoutDashboard } from "lucide-react";
import OverviewDeviceCard from "@/components/ui/overview-device-card";
import PendingCheckInsTable from "@/components/ui/pending-checkins-table";

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
  const [devicesRes, reservationsRes, sessionsRes, pendingCheckInsRes] = await Promise.all([
    supabase.from("devices").select("id, name, status").eq("hall_id", hallId).order("name", { ascending: true }),
    supabase.from("reservations")
      .select("id, start_time, end_time, status, devices!inner(name, hall_id)")
      .eq("devices.hall_id", hallId)
      .order("start_time", { ascending: false })
      .limit(5),
    supabase.from("sessions")
      .select("id, device_id, started_at, user_id, reservation_id, hall_id")
      .is("ended_at", null)
      .or(`hall_id.eq.${hallId},hall_id.is.null`),
    supabase.from("reservations")
      .select("id, start_time, end_time, guest_name, user_id, device_id, devices!inner(name, hall_id)")
      .eq("devices.hall_id", hallId)
      .eq("status", "confirmed")
      .lte("start_time", new Date().toISOString())
      .gte("end_time", new Date().toISOString())
      .order("start_time", { ascending: true }),
  ]);

  const sessions = (sessionsRes.data ?? []) as {
    id: string;
    device_id: string;
    started_at: string;
    user_id: string | null;
    reservation_id: string | null;
    hall_id: string | null;
  }[];

  // Filter sessions by hall_id on the client side
  const hallSessions = sessions.filter(s => !s.hall_id || s.hall_id === hallId);

  // Get guest names for sessions with reservations
  const reservationIds = hallSessions.filter(s => s.reservation_id).map(s => s.reservation_id!);
  const guestNamesMap = new Map<string, string>();
  
  if (reservationIds.length > 0) {
    const { data: reservationsData } = await supabase
      .from("reservations")
      .select("id, guest_name")
      .in("id", reservationIds);
    
    (reservationsData ?? []).forEach(r => {
      if (r.guest_name) guestNamesMap.set(r.id, r.guest_name);
    });
  }

  const devices = (devicesRes.data ?? []).map(d => {
    const hasActiveSession = hallSessions.some(s => s.device_id === d.id);
    return {
      ...d,
      status: hasActiveSession ? "active" : d.status
    };
  });

  const sessionByDevice = new Map(hallSessions.map((s) => [s.device_id, {
    id: s.id,
    started_at: s.started_at,
    user_id: s.user_id,
    guest_name: s.reservation_id ? guestNamesMap.get(s.reservation_id) ?? null : null,
  }]));

  const rows = (reservationsRes.data ?? []) as unknown as {
    id: string; start_time: string; end_time: string; status: string;
    devices: { name: string } | null;
  }[];

  const pendingCheckIns = (pendingCheckInsRes.data ?? []) as unknown as {
    id: string; start_time: string; end_time: string; guest_name: string | null;
    user_id: string | null; device_id: string;
    devices: { name: string } | null;
  }[];

  // Fix reservations that are 'active' but have no session (from old cron job)
  // Reset them back to 'confirmed'
  const activeReservationsRes = await supabase
    .from("reservations")
    .select("id, device_id")
    .eq("status", "active")
    .eq("devices.hall_id", hallId)
    .not("id", "in", `(${sessions.map(s => s.reservation_id).filter(Boolean).join(",") || "'00000000-0000-0000-0000-000000000000'"})`);

  if (activeReservationsRes.data && activeReservationsRes.data.length > 0) {
    const orphanedIds = activeReservationsRes.data.map((r: { id: string }) => r.id);
    await supabase
      .from("reservations")
      .update({ status: "confirmed" })
      .in("id", orphanedIds);
    
    console.log(`[Overview] Reset ${orphanedIds.length} orphaned active reservations to confirmed`);
  }

  // Get user emails for pending check-ins
  const userIds = pendingCheckIns.filter(r => r.user_id).map(r => r.user_id!);
  const userEmailsMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", userIds);
    (profilesData ?? []).forEach((p: { id: string; email: string }) => {
      userEmailsMap.set(p.id, p.email);
    });
  }

  return (
    <>
      {/* devices grid */}
      {devices.length > 0 && (
        <div className="mb-4 sm:mb-6">
          <h2 className="text-xs sm:text-sm font-semibold text-muted-foreground mb-2.5 sm:mb-3">{t("devices")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3">
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

      {/* Pending check-ins */}
      {pendingCheckIns.length > 0 && (
        <div className="mb-4 sm:mb-6">
          <PendingCheckInsTable
            checkIns={pendingCheckIns.map(r => ({
              ...r,
              email: r.user_id ? userEmailsMap.get(r.user_id) : undefined,
            }))}
            hallId={hallId}
          />
        </div>
      )}

      {/* recent reservations */}
      <Card className="border-border/60">
        <CardHeader className="pb-2.5 sm:pb-3">
          <h2 className="text-xs sm:text-sm font-semibold text-muted-foreground">{t("recentReservations")}</h2>
        </CardHeader>
        <Separator className="opacity-40" />
        {rows.length === 0 ? (
          <CardContent className="py-8 sm:py-10 text-center">
            <p className="text-xs sm:text-sm text-muted-foreground">{t("noReservations")}</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto" dir="auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  {[t("device"), t("start"), t("end"), t("status")].map((h) => (
                    <th key={h} className="px-3 py-2 sm:px-4 sm:py-2.5 text-start section-heading">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="table-row-hover border-b border-border/20 last:border-0">
                    <td className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-foreground">{r.devices?.name ?? "—"}</td>
                    <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground whitespace-nowrap text-[10px] sm:text-xs">{fmt(r.start_time)}</td>
                    <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground whitespace-nowrap text-[10px] sm:text-xs">{fmt(r.end_time)}</td>
                    <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                      <span className={`text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded-full ${RES_STATUS[r.status] ?? "badge-completed"}`}>
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
      <div className="mb-4 sm:mb-6">
        <Skeleton className="h-3 sm:h-4 w-20 sm:w-24 mb-2.5 sm:mb-3 skeleton-shimmer" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 sm:h-28 rounded-lg sm:rounded-xl skeleton-shimmer" />
          ))}
        </div>
      </div>
      <Card className="border-border/60">
        <CardHeader><Skeleton className="h-3 sm:h-4 w-32 sm:w-40 skeleton-shimmer" /></CardHeader>
        <CardContent className="space-y-1.5 sm:space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 sm:h-11 rounded-lg skeleton-shimmer" />
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
      <div className="flex items-center gap-2 sm:gap-2.5">
        <LayoutDashboard size={16} className="sm:w-[18px] sm:h-[18px] text-muted-foreground" />
        <div>
          <h1 className="text-lg sm:text-xl font-bold leading-none">{t("overview")}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{t("hallStatusGlance")}</p>
        </div>
      </div>
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent hallId={hallId} />
      </Suspense>
    </div>
  );
}
