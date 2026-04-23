import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getServerClient } from "@/lib/supabase/server";
import type { Device } from "@/services/devices";
import type { DeviceType } from "@/types/device-type";
import DevicesGridClient from "@/components/ui/devices-grid-client";
import { Monitor } from "lucide-react";

export const metadata: Metadata = { title: "Devices | Gaming Hub" };

type DeviceWithType = Device & { device_type?: DeviceType };

type ActiveSession = { id: string; device_id: string; started_at: string; user_id: string | null; guest_name: string | null };
type PendingReservation = { id: string; device_id: string };

async function fetchPageData(hallId: string): Promise<{
  devices: DeviceWithType[];
  deviceTypes: DeviceType[];
  sessions: ActiveSession[];
  reservations: PendingReservation[];
}> {
  const supabase = await getServerClient();

  // Fetch devices with device types
  const { data: deviceData } = await supabase
    .from("devices")
    .select(`
      id, 
      hall_id, 
      name, 
      status, 
      last_heartbeat,
      device_type_id,
      device_types:device_type_id (
        id,
        name,
        name_ar,
        name_en,
        created_at
      )
    `)
    .eq("hall_id", hallId)
    .order("name", { ascending: true });

  const devices = (deviceData ?? []).map(d => ({
    id: d.id,
    hall_id: d.hall_id,
    name: d.name,
    status: d.status,
    last_heartbeat: d.last_heartbeat,
    device_type_id: d.device_type_id,
    device_type: Array.isArray(d.device_types) ? d.device_types[0] : d.device_types
  })) as DeviceWithType[];

  // Get unique device types
  const deviceTypesMap = new Map<string, DeviceType>();
  devices.forEach(d => {
    if (d.device_type) {
      deviceTypesMap.set(d.device_type.id, d.device_type);
    }
  });
  const deviceTypes = Array.from(deviceTypesMap.values());

  const deviceIds = devices.map((d) => d.id);

  if (deviceIds.length === 0) return { devices, deviceTypes, sessions: [], reservations: [] };

  const [sessionsRes, reservationsRes] = await Promise.all([
    supabase.from("sessions").select("id, device_id, started_at, user_id, reservations!inner(guest_name)").is("ended_at", null).in("device_id", deviceIds),
    supabase.from("reservations").select("id, device_id").eq("status", "confirmed").in("device_id", deviceIds),
  ]);

  const sessions = (sessionsRes.data ?? []).map((s: any) => ({
    id: s.id,
    device_id: s.device_id,
    started_at: s.started_at,
    user_id: s.user_id,
    guest_name: s.reservations?.guest_name ?? null,
  })) as ActiveSession[];

  return {
    devices,
    deviceTypes,
    sessions,
    reservations: (reservationsRes.data ?? []) as PendingReservation[],
  };
}

async function DevicesContent({ hallId }: { hallId: string }) {
  const { devices, deviceTypes, sessions, reservations } = await fetchPageData(hallId);

  return (
    <DevicesGridClient
      devices={devices}
      deviceTypes={deviceTypes}
      sessions={sessions}
      reservations={reservations}
      hallId={hallId}
    />
  );
}

function DevicesContentSkeleton() {
  return (
    <div className="space-y-6">
      {/* Filter Skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-24 rounded-lg border border-border/60 bg-card animate-pulse" />
        ))}
      </div>
      
      {/* Devices Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-44 rounded-xl border border-border/60 bg-card animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default async function DevicesPage({ params }: { params: Promise<{ hallId: string; locale: string }> }) {
  const { hallId } = await params;
  const t = await getTranslations("devices");
  const tn = await getTranslations("nav");
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-border/60 bg-card/80 backdrop-blur-sm">
        <div className="page-shell py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.3)" }}
              >
                <Monitor size={20} style={{ color: "oklch(0.65 0.22 280)" }} />
              </div>
              <div>
                <h1 className="text-xl font-bold leading-none">{tn("devices")}</h1>
                <p className="text-xs text-muted-foreground mt-1">{t("manageDevices")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="page-shell py-6">
        <Suspense fallback={<DevicesContentSkeleton />}>
          <DevicesContent hallId={hallId} />
        </Suspense>
      </div>
    </div>
  );
}
