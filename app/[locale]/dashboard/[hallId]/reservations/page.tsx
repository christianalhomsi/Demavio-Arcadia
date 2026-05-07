import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { getServerClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import ReservationActions from "./reservation-actions";
import { CalendarDays, Filter } from "lucide-react";
import DateFilterClient from "./date-filter-client";

type ReservationRow = {
  id: string; start_time: string; end_time: string;
  status: string; user_id: string; guest_name: string | null;
  device_name: string;
  email: string;
};

const STATUS_STYLE: Record<string, string> = {
  confirmed: "badge-confirmed", active: "badge-active",
  cancelled: "badge-cancelled", completed: "badge-completed", pending: "badge-idle",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

async function ReservationsContent({ hallId, targetDate }: { hallId: string; targetDate: string }) {
  const supabase = await getServerClient();
  const t = await getTranslations("dashboard");

  // Try to use database function to get reservations with emails in ONE call
  const { data, error } = await supabase.rpc('get_hall_reservations_by_date', {
    hall_uuid: hallId,
    target_date: targetDate
  });

  let reservations: ReservationRow[] = data || [];

  // Fallback: fetch data manually if function doesn't exist
  if (error || !data) {
    console.warn('[Reservations] Database function not available, using fallback queries');
    
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: reservationsData } = await supabase
      .from("reservations")
      .select("id, start_time, end_time, status, user_id, guest_name, devices!inner(name, hall_id)")
      .eq("devices.hall_id", hallId)
      .gte("start_time", startOfDay.toISOString())
      .lte("start_time", endOfDay.toISOString())
      .order("start_time", { ascending: false });

    const rows = (reservationsData ?? []) as unknown as any[];

    if (rows.length > 0) {
      const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles").select("id, email").in("id", userIds);

        const emailMap = new Map((profilesData ?? []).map((p: { id: string; email: string }) => [p.id, p.email]));
        reservations = rows.map(r => ({ 
          id: r.id,
          start_time: r.start_time,
          end_time: r.end_time,
          status: r.status,
          user_id: r.user_id,
          guest_name: r.guest_name,
          device_name: r.devices?.name || "—",
          email: r.guest_name || emailMap.get(r.user_id) || "—" 
        }));
      } else {
        reservations = rows.map(r => ({ 
          id: r.id,
          start_time: r.start_time,
          end_time: r.end_time,
          status: r.status,
          user_id: r.user_id,
          guest_name: r.guest_name,
          device_name: r.devices?.name || "—",
          email: r.guest_name || "—" 
        }));
      }
    }
  }

  return (
    <>
      {reservations.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">{t("noReservations")}</p>
      ) : (
        <Card className="border-border/60 overflow-hidden">
          <div className="overflow-x-auto" dir="auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  {[t("device"), t("player"), t("start"), t("end"), t("status"), ""].map((h, idx) => (
                    <th key={h || idx} className="px-4 py-2.5 text-start section-heading">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id} className="table-row-hover border-b border-border/20 last:border-0">
                    <td className="px-4 py-3 font-medium">{r.device_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.email}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmt(r.start_time)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmt(r.end_time)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] ?? "badge-completed"}`}>
                        {t(r.status as any)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.status === "pending" && <ReservationActions reservationId={r.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function ReservationsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 rounded-lg skeleton-shimmer" />
      ))}
    </div>
  );
}

export default async function ReservationsPage({ 
  params,
  searchParams 
}: { 
  params: Promise<{ hallId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { hallId } = await params;
  const { date } = await searchParams;
  const t = await getTranslations("dashboard");
  
  // Use today's date if no date provided
  const targetDate = date || new Date().toISOString().split('T')[0];

  return (
    <div className="page-shell">
      <div className="flex items-center gap-2.5">
        <CalendarDays size={18} className="text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold leading-none">{t("reservations")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("allBookings")}</p>
        </div>
      </div>
      <Separator className="opacity-40" />

      {/* Date Filter - Client Component */}
      <DateFilterClient hallId={hallId} initialDate={targetDate} />

      {/* Reservations Table - Server Component */}
      <Suspense key={targetDate} fallback={<ReservationsSkeleton />}>
        <ReservationsContent hallId={hallId} targetDate={targetDate} />
      </Suspense>
    </div>
  );
}
