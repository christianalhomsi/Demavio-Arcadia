import { Suspense } from "react";
import type { Metadata } from "next";
import { getServerClient } from "@/lib/supabase/server";
import type { Device } from "@/services/devices";
import StaffDeviceCard, { type StaffDeviceCardProps } from "@/components/ui/staff-device-card";

export const metadata: Metadata = { title: "Devices | Gaming Hub" };

// ─── types ────────────────────────────────────────────────────────────────────

type ActiveSession = { id: string; device_id: string; started_at: string };
type PendingReservation = { id: string; device_id: string };

// ─── data fetching ────────────────────────────────────────────────────────────

async function fetchPageData(hallId: string): Promise<{
  devices: Device[];
  sessions: ActiveSession[];
  reservations: PendingReservation[];
}> {
  const supabase = await getServerClient();

  // Fetch devices first to get the id list for this hall
  const { data: deviceData } = await supabase
    .from("devices")
    .select("id, hall_id, name, status, last_heartbeat")
    .eq("hall_id", hallId)
    .order("name", { ascending: true });

  const devices = (deviceData ?? []) as Device[];
  const deviceIds = devices.map((d) => d.id);

  if (deviceIds.length === 0) {
    return { devices, sessions: [], reservations: [] };
  }

  // Fetch active sessions and confirmed reservations scoped to this hall's devices
  const [sessionsRes, reservationsRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, device_id, started_at")
      .is("ended_at", null)
      .in("device_id", deviceIds),

    supabase
      .from("reservations")
      .select("id, device_id")
      .eq("status", "confirmed")
      .in("device_id", deviceIds),
  ]);

  return {
    devices,
    sessions: (sessionsRes.data ?? []) as ActiveSession[],
    reservations: (reservationsRes.data ?? []) as PendingReservation[],
  };
}

// ─── inner async component ────────────────────────────────────────────────────

async function DevicesGrid({ hallId }: { hallId: string }) {
  const { devices, sessions, reservations } = await fetchPageData(hallId);

  if (devices.length === 0) {
    return (
      <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
        No devices found for this hall.
      </p>
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
    <div style={grid}>
      {cards.map((props) => (
        <StaffDeviceCard key={props.id} {...props} />
      ))}
    </div>
  );
}

function DevicesGridSkeleton() {
  return (
    <div style={grid}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={skelCard} />
      ))}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function DevicesPage({
  params,
}: {
  params: Promise<{ hallId: string }>;
}) {
  const { hallId } = await params;
  return (
    <div style={page}>
      <p style={pageHeading}>Devices</p>
      <Suspense fallback={<DevicesGridSkeleton />}>
        <DevicesGrid hallId={hallId} />
      </Suspense>
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const page: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
  maxWidth: "1000px",
};

const pageHeading: React.CSSProperties = {
  margin: 0,
  fontSize: "1.25rem",
  fontWeight: 700,
  color: "#111827",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: "1rem",
};

const skelCard: React.CSSProperties = {
  height: "130px",
  borderRadius: "0.75rem",
  background: "#e5e7eb",
};
