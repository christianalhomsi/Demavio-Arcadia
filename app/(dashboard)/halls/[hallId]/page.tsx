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
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("halls")
    .select("id, name, address, created_at")
    .eq("id", hallId)
    .single();
  return data ?? null;
}

async function getDevicesByHall(hallId: string): Promise<Device[]> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("devices")
    .select("id, hall_id, name, status, last_heartbeat")
    .eq("hall_id", hallId)
    .order("name", { ascending: true });
  return data ?? [];
}

async function HallContent({ hallId }: { hallId: string }) {
  const [hall, devices] = await Promise.all([getHallById(hallId), getDevicesByHall(hallId)]);
  if (!hall) notFound();

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-7">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--color-text)" }}>{hall.name}</h1>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>{hall.address ?? "No address provided"}</p>
        </div>
        <span className="text-xs font-medium px-3 py-1 rounded-full"
          style={{ background: "var(--color-surface-2)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
          {devices.length} device{devices.length !== 1 ? "s" : ""}
        </span>
      </div>

      {devices.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🖥</div>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>No devices found for this hall.</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {devices.map((device) => <DeviceCard key={device.id} device={device} hallId={hallId} />)}
        </div>
      )}
    </>
  );
}

function HallContentSkeleton() {
  return (
    <>
      <div className="skeleton h-16 w-72 rounded-xl mb-7" style={{ background: "var(--color-surface)" }} />
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-xl" style={{ background: "var(--color-surface)" }} />
        ))}
      </div>
    </>
  );
}

export default function HallDetailPage({ params }: { params: { hallId: string } }) {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/halls"
        className="inline-flex items-center gap-1 text-sm mb-6 transition-opacity hover:opacity-80"
        style={{ color: "var(--color-muted)" }}>
        ← Back to halls
      </Link>
      <Suspense fallback={<HallContentSkeleton />}>
        <HallContent hallId={params.hallId} />
      </Suspense>
    </div>
  );
}
