import { Suspense } from "react";
import type { Metadata } from "next";
import { getServerClient } from "@/lib/supabase/server";
import type { Device } from "@/services/devices";
import AgentPanel from "./agent-panel";

export const metadata: Metadata = { title: "Agent | Gaming Hub" };

// ─── data ─────────────────────────────────────────────────────────────────────

async function getHallDevices(hallId: string): Promise<Device[]> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("devices")
    .select("id, hall_id, name, status, last_heartbeat")
    .eq("hall_id", hallId)
    .order("name", { ascending: true });
  return (data ?? []) as Device[];
}

// ─── inner async component ────────────────────────────────────────────────────

async function AgentPanelLoader({ hallId }: { hallId: string }) {
  const devices = await getHallDevices(hallId);
  return <AgentPanel devices={devices} hallId={hallId} />;
}

function AgentPanelSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ ...skel, height: "38px", width: "110px" }} />
        ))}
      </div>
      <div style={{ ...skel, height: "200px", borderRadius: "0.75rem" }} />
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function AgentPage({
  params,
}: {
  params: Promise<{ hallId: string }>;
}) {
  const { hallId } = await params;
  return (
    <div style={page}>
      <p style={pageHeading}>Agent commands</p>
      <Suspense fallback={<AgentPanelSkeleton />}>
        <AgentPanelLoader hallId={hallId} />
      </Suspense>
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const page: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem",
  maxWidth: "760px",
};

const pageHeading: React.CSSProperties = {
  margin: 0,
  fontSize: "1.25rem",
  fontWeight: 700,
  color: "#111827",
};

const skel: React.CSSProperties = {
  borderRadius: "0.375rem",
  background: "#e5e7eb",
};
