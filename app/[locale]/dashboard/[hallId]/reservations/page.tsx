"use client";

import { use, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { getBrowserClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import ReservationActions from "./reservation-actions";
import { CalendarDays, Filter } from "lucide-react";

type ReservationRow = {
  id: string; start_time: string; end_time: string;
  status: string; user_id: string; guest_name: string | null;
  devices: { name: string } | null;
  email?: string;
};

const STATUS_STYLE: Record<string, string> = {
  confirmed: "badge-confirmed", active: "badge-active",
  cancelled: "badge-cancelled", completed: "badge-completed", pending: "badge-idle",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function ReservationsPage({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = use(params);
  const t = useTranslations("dashboard");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const fetchReservations = async () => {
      try {
        setLoading(true);
        const supabase = getBrowserClient();

        // Get start and end of selected day
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        const { data, error } = await supabase
          .from("reservations")
          .select("id, start_time, end_time, status, user_id, guest_name, devices!inner(name, hall_id)")
          .eq("devices.hall_id", hallId)
          .gte("start_time", startOfDay.toISOString())
          .lte("start_time", endOfDay.toISOString())
          .order("start_time", { ascending: false });

        if (error) throw error;
        if (!isActive) return;

        const rows = (data ?? []) as unknown as ReservationRow[];

        if (rows.length > 0) {
          const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
          if (userIds.length > 0) {
            const { data: profilesData, error: profilesError } = await supabase
              .from("profiles").select("id, email").in("id", userIds);

            if (profilesError) {
              console.error("Failed to fetch profiles:", profilesError);
            }

            if (!isActive) return;

            const emailMap = new Map((profilesData ?? []).map((p: { id: string; email: string }) => [p.id, p.email]));
            const rowsWithEmail = rows.map(r => ({ 
              ...r, 
              email: r.guest_name || emailMap.get(r.user_id) || "—" 
            }));
            setReservations(rowsWithEmail);
          } else {
            if (!isActive) return;
            setReservations(rows.map(r => ({ ...r, email: r.guest_name || "—" })));
          }
        } else {
          if (!isActive) return;
          setReservations([]);
        }
      } catch (error) {
        console.error("Failed to fetch reservations:", error);
        if (isActive) {
          setReservations([]);
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    fetchReservations();

    return () => {
      isActive = false;
    };
  }, [hallId, selectedDate]);

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

      {/* Date Filter */}
      <Card className="p-5 border-border/60 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
              style={{ 
                background: "linear-gradient(135deg, oklch(0.55 0.26 280 / 0.15), oklch(0.55 0.26 280 / 0.08))", 
                border: "1px solid oklch(0.55 0.26 280 / 0.3)",
                boxShadow: "0 0 20px oklch(0.55 0.26 280 / 0.15)"
              }}
            >
              <Filter size={18} style={{ color: "oklch(0.65 0.22 280)" }} />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-none">{t("filter")}</h3>
              <p className="text-xs text-muted-foreground mt-1">{t("selectDate")}</p>
            </div>
          </div>
          
          <div className="flex-1 flex items-center gap-3">
            <DatePicker
              value={selectedDate}
              onChange={setSelectedDate}
              className="flex-1 max-w-xs"
            />
            <Button
              variant="outline"
              onClick={() => setSelectedDate(new Date())}
              className="h-11 px-5 rounded-xl font-semibold border-border/60 hover:bg-primary/10 hover:border-primary/50 hover:text-primary transition-all duration-200 whitespace-nowrap"
            >
              {t("today")}
            </Button>
          </div>

          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-bold text-primary">
              {reservations.length} {t("reservations")}
            </span>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg skeleton-shimmer" />
          ))}
        </div>
      ) : reservations.length === 0 ? (
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
                    <td className="px-4 py-3 font-medium">{r.devices?.name ?? "—"}</td>
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
    </div>
  );
}
