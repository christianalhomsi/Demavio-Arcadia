import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import type { Hall } from "@/types/hall";
import type { Device } from "@/services/devices";
import DeviceCard from "@/components/ui/device-card";

export const metadata: Metadata = { title: "Hall Details | Gaming Hub" };

async function getHallById(hallId: string): Promise<Hall | null> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from("halls")
    .select("id, name, capacity, location, is_active, created_at")
    .eq("id", hallId)
    .eq("is_active", true)
    .single();
  return data ?? null;
}

async function getDevicesByHall(hallId: string): Promise<Device[]> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from("devices")
    .select("id, hall_id, name, status, last_heartbeat")
    .eq("hall_id", hallId)
    .order("name", { ascending: true });
  return data ?? [];
}

async function HallContent({ hallId }: { hallId: string }) {
  const [hall, devices] = await Promise.all([
    getHallById(hallId),
    getDevicesByHall(hallId),
  ]);

  if (!hall) notFound();

  return (
    <>
      <div style={header}>
        <div>
          <h1 style={heading}>{hall.name}</h1>
          <p style={subheading}>{hall.location ?? "No address provided"}</p>
        </div>
        <span style={capacityBadge}>{hall.capacity} seats</span>
      </div>

      {devices.length === 0 ? (
        <p style={empty}>No devices found for this hall.</p>
      ) : (
        <div style={grid}>
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} hallId={hallId} />
          ))}
        </div>
      )}
    </>
  );
}

function HallContentSkeleton() {
  return (
    <>
      <div style={{ ...skeletonBlock, height: "4rem", maxWidth: "320px", marginBottom: "2rem" }} />
      <div style={grid}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ ...skeletonBlock, height: "100px" }} />
        ))}
      </div>
    </>
  );
}

export default function HallDetailPage({
  params,
}: {
  params: { hallId: string };
}) {
  return (
    <div style={page}>
      <Link href="/halls" style={backLink}>← Back to halls</Link>
      <Suspense fallback={<HallContentSkeleton />}>
        <HallContent hallId={params.hallId} />
      </Suspense>
    </div>
  );
}

const page: React.CSSProperties = {
  padding: "2rem",
  maxWidth: "1100px",
  margin: "0 auto",
  fontFamily: "system-ui, sans-serif",
};

const backLink: React.CSSProperties = {
  display: "inline-block",
  marginBottom: "1.5rem",
  fontSize: "0.875rem",
  color: "#6b7280",
  textDecoration: "none",
};

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  marginBottom: "1.75rem",
  gap: "1rem",
  flexWrap: "wrap",
};

const heading: React.CSSProperties = {
  margin: "0 0 0.25rem",
  fontSize: "1.5rem",
  fontWeight: 700,
  color: "#111827",
};

const subheading: React.CSSProperties = {
  margin: 0,
  fontSize: "0.9375rem",
  color: "#6b7280",
};

const capacityBadge: React.CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 500,
  padding: "0.25rem 0.75rem",
  borderRadius: "9999px",
  background: "#f3f4f6",
  color: "#374151",
  whiteSpace: "nowrap",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: "1rem",
};

const empty: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "0.875rem",
};

const skeletonBlock: React.CSSProperties = {
  borderRadius: "0.75rem",
  background: "#e5e7eb",
};
