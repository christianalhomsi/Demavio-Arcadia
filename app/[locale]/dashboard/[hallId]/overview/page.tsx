import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Receipt, Calendar, Package, Wallet, Users } from "lucide-react";
import OverviewDeviceCard from "@/components/ui/overview-device-card";
import PendingCheckInsTable from "@/components/ui/pending-checkins-table";
import Link from "next/link";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
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

  const [devicesRes, reservationsRes, sessionsRes, pendingCheckInsRes] = await Promise.all([
    supabase.from("devices").select("id, name, status").eq("hall_id", hallId).order("name", { ascending: true }),
    supabase.from("reservations")
      .select("id, start_time, end_time, status, devices!inner(name, hall_id)")
      .eq("devices.hall_id", hallId)
      .order("start_time", { ascending: false })
      .limit(5),
    supabase.from("sessions")
      .select("id, device_id, started_at, user_id, reservation_id")
      .is("ended_at", null)
      .eq("hall_id", hallId),
    supabase.from("reservations")
      .select("id, start_time, end_time, guest_name, user_id, device_id, devices!inner(name, hall_id)")
      .eq("devices.hall_id", hallId)
      .eq("status", "confirmed")
      .lte("start_time", new Date().toISOString())
      .gte("end_time", new Date().toISOString())
      .order("start_time", { ascending: true }),
  ]);

  const devices = devicesRes.data || [];
  const sessions = sessionsRes.data || [];
  const rows = reservationsRes.data || [];
  const pendingCheckIns = pendingCheckInsRes.data || [];

  const reservationIds = sessions.filter(s => s.reservation_id).map(s => s.reservation_id!);
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

  const userIds = pendingCheckIns.filter((r: any) => r.user_id).map((r: any) => r.user_id!);
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
      <div className="mb-4 sm:mb-6">
        <h2 className="text-xs sm:text-sm font-semibold text-muted-foreground mb-2.5 sm:mb-3">{t("quickActions")}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          <Link href={`/dashboard/${hallId}/finance/invoices`} className="group">
            <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card hover:border-border transition-all duration-300 hover:shadow-lg hover:scale-[1.02] cursor-pointer">
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: "linear-gradient(135deg, oklch(0.65 0.20 140 / 0.05), transparent)" }}
              />
              <div className="relative p-4 sm:p-5 flex flex-col items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.65 0.20 140 / 0.15), oklch(0.65 0.20 140 / 0.08))",
                    border: "1px solid oklch(0.65 0.20 140 / 0.25)"
                  }}
                >
                  <Receipt size={20} style={{ color: "oklch(0.65 0.20 140)" }} />
                </div>
                <span className="text-xs sm:text-sm font-semibold text-center">{t("invoices")}</span>
              </div>
            </div>
          </Link>
          
          <Link href={`/dashboard/${hallId}/reservations`} className="group">
            <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card hover:border-border transition-all duration-300 hover:shadow-lg hover:scale-[1.02] cursor-pointer">
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: "linear-gradient(135deg, oklch(0.55 0.26 280 / 0.05), transparent)" }}
              />
              <div className="relative p-4 sm:p-5 flex flex-col items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.55 0.26 280 / 0.15), oklch(0.55 0.26 280 / 0.08))",
                    border: "1px solid oklch(0.55 0.26 280 / 0.25)"
                  }}
                >
                  <Calendar size={20} style={{ color: "oklch(0.55 0.26 280)" }} />
                </div>
                <span className="text-xs sm:text-sm font-semibold text-center">{t("reservations")}</span>
              </div>
            </div>
          </Link>
          
          <Link href={`/dashboard/${hallId}/products`} className="group">
            <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card hover:border-border transition-all duration-300 hover:shadow-lg hover:scale-[1.02] cursor-pointer">
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: "linear-gradient(135deg, oklch(0.82 0.14 200 / 0.05), transparent)" }}
              />
              <div className="relative p-4 sm:p-5 flex flex-col items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.82 0.14 200 / 0.15), oklch(0.82 0.14 200 / 0.08))",
                    border: "1px solid oklch(0.82 0.14 200 / 0.25)"
                  }}
                >
                  <Package size={20} style={{ color: "oklch(0.82 0.14 200)" }} />
                </div>
                <span className="text-xs sm:text-sm font-semibold text-center">{t("products")}</span>
              </div>
            </div>
          </Link>
          
          <Link href={`/dashboard/${hallId}/wallets`} className="group">
            <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card hover:border-border transition-all duration-300 hover:shadow-lg hover:scale-[1.02] cursor-pointer">
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: "linear-gradient(135deg, oklch(0.70 0.18 60 / 0.05), transparent)" }}
              />
              <div className="relative p-4 sm:p-5 flex flex-col items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.70 0.18 60 / 0.15), oklch(0.70 0.18 60 / 0.08))",
                    border: "1px solid oklch(0.70 0.18 60 / 0.25)"
                  }}
                >
                  <Wallet size={20} style={{ color: "oklch(0.70 0.18 60)" }} />
                </div>
                <span className="text-xs sm:text-sm font-semibold text-center">{t("wallets")}</span>
              </div>
            </div>
          </Link>
          
          <Link href={`/dashboard/${hallId}/devices`} className="group">
            <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card hover:border-border transition-all duration-300 hover:shadow-lg hover:scale-[1.02] cursor-pointer">
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: "linear-gradient(135deg, oklch(0.60 0.22 320 / 0.05), transparent)" }}
              />
              <div className="relative p-4 sm:p-5 flex flex-col items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.60 0.22 320 / 0.15), oklch(0.60 0.22 320 / 0.08))",
                    border: "1px solid oklch(0.60 0.22 320 / 0.25)"
                  }}
                >
                  <Users size={20} style={{ color: "oklch(0.60 0.22 320)" }} />
                </div>
                <span className="text-xs sm:text-sm font-semibold text-center">{t("devices")}</span>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {devices.length > 0 && (
        <div className="mb-4 sm:mb-6">
          <h2 className="text-xs sm:text-sm font-semibold text-muted-foreground mb-2.5 sm:mb-3">{t("devices")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3">
            {devices.map((device: any) => {
              const session = sessions.find((s: any) => s.device_id === device.id);
              return (
                <OverviewDeviceCard
                  key={device.id}
                  id={device.id}
                  name={device.name}
                  status={device.status}
                  hallId={hallId}
                  activeSession={session ? {
                    id: session.id,
                    started_at: session.started_at,
                    user_id: session.user_id,
                    guest_name: session.reservation_id ? guestNamesMap.get(session.reservation_id) ?? null : null,
                  } : null}
                />
              );
            })}
          </div>
        </div>
      )}

      {pendingCheckIns.length > 0 && (
        <div className="mb-4 sm:mb-6">
          <PendingCheckInsTable
            checkIns={pendingCheckIns.map((r: any) => ({
              ...r,
              email: r.user_id ? userEmailsMap.get(r.user_id) : undefined,
            }))}
            hallId={hallId}
          />
        </div>
      )}

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
                {rows.map((r: any) => (
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
  const tn = await getTranslations("nav");
  return (
    <div className="page-shell">
      <div className="relative rounded-2xl overflow-hidden border border-border/50 bg-card mb-6">
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{ 
            backgroundImage: "radial-gradient(circle at 20% 50%, oklch(0.55 0.26 280) 0%, transparent 50%), radial-gradient(circle at 80% 30%, oklch(0.82 0.14 200) 0%, transparent 40%)" 
          }} 
        />
        <div 
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, oklch(0.55 0.26 280 / 0.5), transparent)" }}
        />
        <div className="relative p-5 sm:p-6 flex items-center gap-4">
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ 
              background: "linear-gradient(135deg, oklch(0.55 0.26 280 / 0.15), oklch(0.55 0.26 280 / 0.08))",
              border: "1px solid oklch(0.55 0.26 280 / 0.3)"
            }}
          >
            <LayoutDashboard size={22} style={{ color: "oklch(0.65 0.22 280)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{tn("dashboard")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t("hallStatusGlance")}</p>
          </div>
        </div>
      </div>

      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent hallId={hallId} />
      </Suspense>
    </div>
  );
}
