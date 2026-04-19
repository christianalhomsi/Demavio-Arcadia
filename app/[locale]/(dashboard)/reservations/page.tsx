import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next-intl/server";
import { getServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Gamepad2, ChevronRight, CalendarDays, Plus, CalendarX } from "lucide-react";

export const metadata: Metadata = { title: "My Reservations" };

type ReservationRow = {
  id: string; start_time: string; end_time: string; status: string;
  devices: { name: string; halls: { name: string } | null } | null;
};

const STATUS_CLS: Record<string, string> = {
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
  if (!user) redirect({ href: "/login", locale });

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
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "oklch(0.55 0.26 280 / 0.08)", border: "1px solid oklch(0.55 0.26 280 / 0.15)" }}
        >
          <CalendarX size={24} className="text-muted-foreground" />
        </div>
        <p className="font-semibold text-foreground mb-1">No reservations yet</p>
        <p className="text-sm text-muted-foreground mb-4">Book a device to get started</p>
        <Link
          href="/reservations/new"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-white transition-colors"
          style={{ background: "oklch(0.55 0.26 280)" }}
        >
          <Plus size={13} />
          Book a device
        </Link>
      </div>
    );
  }

  return (
    <Card className="border-border/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              {["Hall", "Device", "Start", "End", "Status"].map((h) => (
                <th key={h} className="px-4 py-3 text-left section-heading">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="table-row-hover border-b border-border/20 last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">{r.devices?.halls?.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.devices?.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{fmt(r.start_time)}</td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{fmt(r.end_time)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLS[r.status] ?? "badge-completed"}`}>
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
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 rounded-lg skeleton-shimmer" />
      ))}
    </div>
  );
}

export default async function ReservationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-5 h-14 border-b border-border/60 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <Link href="/halls" className="flex items-center gap-2 group shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all group-hover:scale-105"
            style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.3)" }}
          >
            <Gamepad2 size={15} style={{ color: "oklch(0.65 0.22 280)" }} />
          </div>
          <span className="text-sm font-bold tracking-tight hidden sm:block">
            <span style={{ color: "oklch(0.55 0.26 280)" }}>Arc</span>
            <span style={{ color: "oklch(0.82 0.14 200)" }}>adia</span>
          </span>
        </Link>
        <Separator orientation="vertical" className="h-5 opacity-30" />
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/halls" className="text-muted-foreground hover:text-foreground transition-colors">Halls</Link>
          <ChevronRight size={13} className="text-border" />
          <span className="text-foreground font-medium">My Reservations</span>
        </nav>
        <div className="flex-1" />
        <Link
          href="/reservations/new"
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium text-white transition-colors"
          style={{ background: "oklch(0.55 0.26 280)" }}
        >
          <Plus size={12} />
          New
        </Link>
      </header>

      <div className="page-shell">
        <div className="flex items-center gap-2.5">
          <CalendarDays size={18} className="text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight leading-none">My Reservations</h1>
            <p className="text-sm text-muted-foreground mt-0.5">All your device bookings</p>
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
