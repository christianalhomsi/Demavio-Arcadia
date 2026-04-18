import { Suspense } from "react";
import type { Metadata } from "next";
import { getServerClient } from "@/lib/supabase/server";
import type { Device } from "@/services/devices";
import StaffDeviceCard, { type StaffDeviceCardProps } from "@/components/ui/staff-device-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Monitor } from "lucide-react";

export const metadata: Metadata = { title: "Devices | Gaming Hub" };

type ActiveSession = { id: string; device_id: string; started_at: string };
type PendingReservation = { id: string; device_id: string };

async function fetchPageData(hallId: string): Promise<{
  devices: Device[];
  sessions: ActiveSession[];
  reservations: PendingReservation[];
}> {
  const supabase = await getServerClient();

  const { data: deviceData } = await supabase
    .from("devices")
    .select("id, hall_id, name, status, last_heartbeat")
    .eq("hall_id", hallId)
    .order("name", { ascending: true });

  const devices = (deviceData ?? []) as Device[];
  const deviceIds = devices.map((d) => d.id);

  if (deviceIds.length === 0) return { devices, sessions: [], reservations: [] };

  const [sessionsRes, reservationsRes] = await Promise.all([
    supabase.from("sessions").select("id, device_id, started_at").is("ended_at", null).in("device_id", deviceIds),
    supabase.from("reservations").select("id, device_id").eq("status", "confirmed").in("device_id", deviceIds),
  ]);

  return {
    devices,
    sessions: (sessionsRes.data ?? []) as ActiveSession[],
    reservations: (reservationsRes.data ?? []) as PendingReservation[],
  };
}

async function DevicesGrid({ hallId }: { hallId: string }) {
  const { devices, sessions, reservations } = await fetchPageData(hallId);

  if (devices.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">No devices found for this hall.</p>
    );
  }

  const sessionByDevice = new Map(sessions.map((s) => [s.device_id, s]));
  const reservationByDevice = new Map(reservations.map((r) => [r.device_id, r]));

  const cards: StaffDeviceCardProps[] = devices.map((d) => ({
    id: d.id,
    name: d.name,
    status: d.status,
    hallId,
    activeSession: sessionByDevice.get(d.id)
      ? { id: sessionByDevice.get(d.id)!.id, started_at: sessionByDevice.get(d.id)!.started_at }
      : null,
    pendingReservation: reservationByDevice.get(d.id)
      ? { id: reservationByDevice.get(d.id)!.id }
      : null,
  }));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {cards.map((props) => (
        <StaffDeviceCard key={props.id} {...props} />
      ))}
    </div>
  );
}

function DevicesGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-xl skeleton-shimmer" />
      ))}
    </div>
  );
}

export default async function DevicesPage({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  return (
    <div className="page-shell">
      <div className="flex items-center gap-2.5">
        <Monitor size={18} className="text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold leading-none">Devices</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage hall devices</p>
        </div>
      </div>
      <Suspense fallback={<DevicesGridSkeleton />}>
        <DevicesGrid hallId={hallId} />
      </Suspense>
    </div>
  );
}
