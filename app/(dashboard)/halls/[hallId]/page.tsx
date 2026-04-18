import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import type { Hall } from "@/types/hall";
import type { Device } from "@/services/devices";
import DeviceCard from "@/components/ui/device-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Gamepad2, ChevronRight, ChevronLeft, Building2,
  MapPin, Monitor, Plus, CheckCircle2, Timer, Clock, WifiOff,
} from "lucide-react";

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

const STATUS_META: Record<string, { cls: string; icon: React.ElementType }> = {
  available: { cls: "badge-available", icon: CheckCircle2 },
  active:    { cls: "badge-active",    icon: Timer },
  offline:   { cls: "badge-offline",   icon: WifiOff },
  idle:      { cls: "badge-idle",      icon: Clock },
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
      {/* Hall hero banner */}
      <div className="relative rounded-2xl overflow-hidden border border-border/50 bg-card mb-8">
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(circle at 10% 50%, oklch(0.55 0.26 280) 0%, transparent 50%), radial-gradient(circle at 90% 20%, oklch(0.82 0.14 200) 0%, transparent 40%)" }} />
        <div className="absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, oklch(0.55 0.26 280 / 0.4), transparent)" }} />

        <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "oklch(0.55 0.26 280 / 0.12)", border: "1px solid oklch(0.55 0.26 280 / 0.25)" }}>
            <Building2 size={26} style={{ color: "oklch(0.65 0.22 280)" }} />
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{hall.name}</h1>
            {hall.address && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                <MapPin size={13} className="shrink-0" />
                {hall.address}
              </p>
            )}
          </div>

          {/* status pills */}
          <div className="flex flex-wrap gap-2 shrink-0">
            {Object.entries(counts).filter(([, v]) => v > 0).map(([status, count]) => {
              const meta = STATUS_META[status];
              const Icon = meta?.icon ?? Monitor;
              return (
                <span key={status} className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${meta?.cls ?? ""}`}>
                  <Icon size={11} />
                  {count} {status}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Devices */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Devices · {devices.length}
        </p>
      </div>

      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-border/40 border-dashed">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "oklch(0.55 0.26 280 / 0.08)", border: "1px solid oklch(0.55 0.26 280 / 0.15)" }}>
            <Monitor size={24} className="text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No devices in this hall.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {devices.map((device) => <DeviceCard key={device.id} device={device} hallId={hallId} />)}
        </div>
      )}
    </>
  );
}

function HallContentSkeleton() {
  return (
    <>
      <Skeleton className="h-36 rounded-2xl skeleton-shimmer mb-8" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl skeleton-shimmer" />
        ))}
      </div>
    </>
  );
}

export default async function HallDetailPage({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
          <Link href="/halls" className="flex items-center gap-2 group shrink-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center transition-all group-hover:scale-105"
              style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.3)" }}>
              <Gamepad2 size={16} style={{ color: "oklch(0.65 0.22 280)" }} />
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
            <span className="text-foreground font-medium">Details</span>
          </nav>
          <div className="flex-1" />
          <Link href="/reservations/new"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "oklch(0.55 0.26 280)" }}>
            <Plus size={13} />
            Book Device
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8">
        <Link href="/halls"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted -ml-2 mb-6 w-fit">
          <ChevronLeft size={14} />
          Back to halls
        </Link>

        <Suspense fallback={<HallContentSkeleton />}>
          <HallContent hallId={hallId} />
        </Suspense>
      </main>
    </div>
  );
}
