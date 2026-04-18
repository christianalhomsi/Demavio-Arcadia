import { Suspense } from "react";
import type { Metadata } from "next";
import { getServerClient } from "@/lib/supabase/server";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import ReservationActions from "./reservation-actions";
import { CalendarDays } from "lucide-react";

export const metadata: Metadata = { title: "Reservations" };

type ReservationRow = {
  id: string; start_time: string; end_time: string;
  status: string; user_id: string;
  devices: { name: string } | null;
};

const STATUS_STYLE: Record<string, string> = {
  confirmed: "badge-confirmed", active: "badge-active",
  cancelled: "badge-cancelled", completed: "badge-completed", pending: "badge-idle",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

async function ReservationsList({ hallId }: { hallId: string }) {
  const supabase = await getServerClient();

  // single query using join instead of 3 sequential queries
  const { data } = await supabase
    .from("reservations")
    .select("id, start_time, end_time, status, user_id, devices!inner(name, hall_id)")
    .eq("devices.hall_id", hallId)
    .order("start_time", { ascending: false });

  const rows = (data ?? []) as unknown as ReservationRow[];

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-10 text-center">No reservations yet.</p>;
  }

  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  const { data: profilesData } = await supabase
    .from("profiles").select("id, email").in("id", userIds);

  const emailMap = new Map((profilesData ?? []).map((p: { id: string; email: string }) => [p.id, p.email]));
  const rowsWithEmail = rows.map(r => ({ ...r, email: emailMap.get(r.user_id) ?? "—" }));

  return (
    <Card className="border-border/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40">
              {["Device", "Player", "Start", "End", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left section-heading">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsWithEmail.map((r) => (
              <tr key={r.id} className="table-row-hover border-b border-border/20 last:border-0">
                <td className="px-4 py-3 font-medium">{r.devices?.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{r.email}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmt(r.start_time)}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmt(r.end_time)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status] ?? "badge-completed"}`}>
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
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

export default async function ReservationsPage({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  return (
    <div className="page-shell">
      <div className="flex items-center gap-2.5">
        <CalendarDays size={18} className="text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold leading-none">Reservations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All bookings for this hall</p>
        </div>
      </div>
      <Separator className="opacity-40" />
      <Suspense fallback={<ReservationsSkeleton />}>
        <ReservationsList hallId={hallId} />
      </Suspense>
    </div>
  );
}
