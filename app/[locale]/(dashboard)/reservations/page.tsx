import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ChevronRight, CalendarDays, Plus, CalendarX } from "lucide-react";
import Logo from "@/components/ui/logo";

export const metadata: Metadata = { title: "My Reservations" };

type ReservationRow = {
  id: string; start_time: string; end_time: string; status: string;
  devices: { name: string; halls: { name: string } | null } | null;
};

const STATUS_CLS: Record<string, string> = {
  pending:   "badge-pending",
  confirmed: "badge-confirmed",
  active:    "badge-active",
  cancelled: "badge-cancelled",
  completed: "badge-completed",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

async function ReservationsList({ locale }: { locale: string }) {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data, error } = await supabase
    .from("reservations")
    .select("id, start_time, end_time, status, devices(name, halls(name))")
    .eq("user_id", user.id)
    .order("start_time", { ascending: false });

  if (error) {
    return (
      <Card className="border-destructive/30 p-6 text-center">
        <p className="text-sm text-destructive">Failed to load reservations.</p>
      </Card>
    );
  }

  const rows = (data ?? []) as unknown as ReservationRow[];

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center">
        <div
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4"
          style={{ background: "oklch(0.55 0.26 280 / 0.08)", border: "1px solid oklch(0.55 0.26 280 / 0.15)" }}
        >
          <CalendarX size={20} className="sm:w-6 sm:h-6 text-muted-foreground" />
        </div>
        <p className="text-sm sm:text-base font-semibold text-foreground mb-1">No reservations yet</p>
        <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">Book a device to get started</p>
        <Link
          href="/reservations/new"
          className="inline-flex items-center gap-1 sm:gap-1.5 h-7 sm:h-8 px-2.5 sm:px-3 rounded-lg text-[10px] sm:text-xs font-medium text-white transition-colors"
          style={{ background: "oklch(0.55 0.26 280)" }}
        >
          <Plus size={12} className="sm:w-[13px] sm:h-[13px]" />
          Book a device
        </Link>
      </div>
    );
  }

  return (
    <Card className="border-border/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              {["Hall", "Device", "Start", "End", "Status"].map((h) => (
                <th key={h} className="px-3 py-2.5 sm:px-4 sm:py-3 text-left section-heading">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="table-row-hover border-b border-border/20 last:border-0">
                <td className="px-3 py-2.5 sm:px-4 sm:py-3 font-medium text-foreground">{r.devices?.halls?.name ?? "—"}</td>
                <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground">{r.devices?.name ?? "—"}</td>
                <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground whitespace-nowrap text-[10px] sm:text-xs">{fmt(r.start_time)}</td>
                <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-muted-foreground whitespace-nowrap text-[10px] sm:text-xs">{fmt(r.end_time)}</td>
                <td className="px-3 py-2.5 sm:px-4 sm:py-3">
                  <span className={`text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded-full ${STATUS_CLS[r.status] ?? "badge-completed"}`}>
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
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
    <div className="space-y-1.5 sm:space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-10 sm:h-12 rounded-lg skeleton-shimmer" />
      ))}
    </div>
  );
}

export default async function ReservationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-5 h-12 sm:h-14 border-b border-border/60 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <Logo href="/halls" size="xs" showText={true} />
        <Separator orientation="vertical" className="h-4 sm:h-5 opacity-30 hidden sm:block" />
        <nav className="hidden sm:flex items-center gap-1 text-xs sm:text-sm">
          <Link href="/halls" className="text-muted-foreground hover:text-foreground transition-colors">Halls</Link>
          <ChevronRight size={12} className="text-border" />
          <span className="text-foreground font-medium">My Reservations</span>
        </nav>
        <div className="flex-1" />
        <Link
          href="/reservations/new"
          className="inline-flex items-center gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg text-[10px] sm:text-xs font-medium text-white transition-colors"
          style={{ background: "oklch(0.55 0.26 280)" }}
        >
          <Plus size={11} className="sm:w-3 sm:h-3" />
          <span className="hidden xs:inline">New</span>
        </Link>
      </header>

      <div className="page-shell">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <CalendarDays size={16} className="sm:w-[18px] sm:h-[18px] text-muted-foreground" />
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight leading-none">My Reservations</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">All your device bookings</p>
          </div>
        </div>
        <Separator className="opacity-40" />
        <Suspense fallback={<ReservationsSkeleton />}>
          <ReservationsList locale={locale} />
        </Suspense>
      </div>
    </div>
  );
}
