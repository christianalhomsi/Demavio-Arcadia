import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import type { Hall } from "@/types/hall";
import type { Device } from "@/services/devices";
import DeviceCard from "@/components/ui/device-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Hall Details" };

async function getHallById(hallId: string): Promise<Hall | null> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("halls").select("id, name, address, created_at")
    .eq("id", hallId).single();
  return data ?? null;
}

async function getDevicesByHall(hallId: string): Promise<Device[]> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("devices").select("id, hall_id, name, status, last_heartbeat")
    .eq("hall_id", hallId).order("name", { ascending: true });
  return data ?? [];
}

const STATUS_COUNT_STYLE: Record<string, string> = {
  available: "badge-available",
  active:    "badge-active",
  offline:   "badge-offline",
  idle:      "badge-idle",
};

async function HallContent({ hallId }: { hallId: string }) {
  const [hall, devices] = await Promise.all([getHallById(hallId), getDevicesByHall(hallId)]);
  if (!hall) notFound();

  const counts = {
    available: devices.filter(d => d.status === "available").length,
    active:    devices.filter(d => d.status === "active").length,
    idle:      devices.filter(d => d.status === "idle").length,
    offline:   devices.filter(d => d.status === "offline").length,
  };

  return (
    <>
      {/* hall info */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: "oklch(0.55 0.26 280 / 0.12)", border: "1px solid oklch(0.55 0.26 280 / 0.2)" }}>
            🏟
          </div>
          <div>
            <h1 className="text-xl font-bold">{hall.name}</h1>
            <p className="text-sm text-muted-foreground">{hall.address ?? "No address"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(counts).filter(([, v]) => v > 0).map(([status, count]) => (
            <span key={status} className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COUNT_STYLE[status]}`}>
              {count} {status}
            </span>
          ))}
        </div>
      </div>

      <Separator className="opacity-40" />

      {/* devices grid */}
      {devices.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🖥</div>
          <p className="text-sm text-muted-foreground">No devices in this hall.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {devices.map((device) => <DeviceCard key={device.id} device={device} hallId={hallId} />)}
        </div>
      )}
    </>
  );
}

function HallContentSkeleton() {
  return (
    <>
      <Skeleton className="h-16 w-80 rounded-xl skeleton-shimmer" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl skeleton-shimmer" />
        ))}
      </div>
    </>
  );
}

export default async function HallDetailPage({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
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
        <span className="text-sm font-medium text-foreground">Details</span>
        <div className="flex-1" />
        <Link href="/reservations/new" className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg text-xs font-medium text-white transition-colors" style={{ background: "oklch(0.55 0.26 280)" }}>
          + Book Device
        </Link>
      </header>

      <div className="page-shell">
        <Link href="/halls" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted -ml-2 w-fit">
        ← Back to halls
      </Link>

        <Suspense fallback={<HallContentSkeleton />}>
          <HallContent hallId={hallId} />
        </Suspense>
      </div>
    </div>
  );
}
