import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

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

async function ReservationsList() {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
      <Card className="border-border/60 py-16 text-center">
        <div className="text-4xl mb-3">📅</div>
        <p className="font-semibold text-foreground mb-1">No reservations yet</p>
        <p className="text-sm text-muted-foreground mb-4">Book a device to get started</p>
        <Link href="/reservations/new" className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg text-xs font-medium text-white transition-colors" style={{ background: "oklch(0.55 0.26 280)" }}>
          Book a device
        </Link>
      </Card>
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

function Skeleton_() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 rounded-lg skeleton-shimmer" />
      ))}
    </div>
  );
}

export default function ReservationsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* nav */}
      <header className="flex items-center gap-3 px-5 h-14 border-b border-border/60 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <Link href="/halls" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
            style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.3)" }}>
            🎮
          </div>
          <span className="text-sm font-bold tracking-tight hidden sm:block">
            <span style={{ color: "oklch(0.55 0.26 280)" }}>Gaming</span>
            <span style={{ color: "oklch(0.82 0.14 200)" }}>Hub</span>
          </span>
        </Link>
        <Separator orientation="vertical" className="h-5 opacity-30" />
        <Link href="/halls" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Halls</Link>
        <span className="text-border text-sm">/</span>
        <span className="text-sm font-medium text-foreground">My Reservations</span>
        <div className="flex-1" />
        <Link href="/reservations/new" className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg text-xs font-medium text-white transition-colors" style={{ background: "oklch(0.55 0.26 280)" }}>
          + New
        </Link>
      </header>

      <div className="page-shell">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Reservations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All your device bookings</p>
        </div>
        <Separator className="opacity-40" />
        <Suspense fallback={<Skeleton_ />}>
          <ReservationsList />
        </Suspense>
      </div>
    </div>
  );
}
