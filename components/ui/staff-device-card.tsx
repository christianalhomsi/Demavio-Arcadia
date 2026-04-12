"use client";

import { useState } from "react";
import type { DeviceStatus } from "@/services/devices";

export type StaffDeviceCardProps = {
  id: string;
  name: string;
  status: DeviceStatus;
  hallId: string;
  pendingReservation: { id: string } | null;
  activeSession: { id: string; started_at: string } | null;
};

const STATUS: Record<DeviceStatus, { bg: string; color: string; label: string }> = {
  available: { bg: "#14532d33", color: "#22c55e", label: "Available" },
  active:    { bg: "#1e3a5f33", color: "#60a5fa", label: "Active" },
  offline:   { bg: "#1f212833", color: "#6b7280", label: "Offline" },
  idle:      { bg: "#78350f33", color: "#f59e0b", label: "Reserved" },
};

function elapsed(startedAt: string): string {
  const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function StaffDeviceCard(props: StaffDeviceCardProps) {
  const { id, name, hallId, pendingReservation, activeSession } = props;
  const [status, setStatus]           = useState<DeviceStatus>(props.status);
  const [session, setSession]         = useState(activeSession);
  const [reservation, setReservation] = useState(pendingReservation);
  const [ratePerHour, setRatePerHour] = useState("");
  const [showEndForm, setShowEndForm] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  async function handleCheckIn() {
    if (!reservation) return;
    setError(null); setLoading(true);
    const res = await fetch("/api/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservation.id, device_id: id, hall_id: hallId }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setStatus("active"); setSession({ id: data.id, started_at: data.started_at }); setReservation(null);
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json?.error ?? "Check-in failed.");
    }
  }

  async function handleEndSession() {
    if (!session) return;
    const rate = parseFloat(ratePerHour);
    if (!rate || rate <= 0) { setError("Enter a valid rate per hour."); return; }
    setError(null); setLoading(true);
    const res = await fetch(`/api/sessions/${session.id}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hall_id: hallId, rate_per_hour: rate }),
    });
    setLoading(false);
    if (res.ok) { setStatus("available"); setSession(null); setShowEndForm(false); setRatePerHour(""); }
    else {
      const json = await res.json().catch(() => ({}));
      setError(json?.error ?? "Failed to end session.");
    }
  }

  const s = STATUS[status] ?? STATUS.offline;

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{name}</p>
        <span className="text-xs font-medium px-2.5 py-0.5 rounded-full shrink-0"
          style={{ background: s.bg, color: s.color }}>{s.label}</span>
      </div>

      {/* session timer */}
      {status === "active" && session && (
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          ⏱ Session running · {elapsed(session.started_at)}
        </p>
      )}
      {status === "idle" && reservation && (
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          📋 Confirmed reservation waiting
        </p>
      )}

      {error && <span className="text-xs" style={{ color: "var(--color-danger)" }}>{error}</span>}

      {/* check-in */}
      {status === "idle" && reservation && !loading && (
        <button onClick={handleCheckIn}
          className="self-start px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
          style={{ background: "var(--color-primary)", color: "#fff" }}>
          Check in
        </button>
      )}

      {/* end session */}
      {status === "active" && session && !showEndForm && (
        <button onClick={() => { setShowEndForm(true); setError(null); }}
          className="self-start px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
          style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)", background: "transparent" }}>
          End session
        </button>
      )}

      {showEndForm && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Rate / hour</label>
            <input type="number" min="0" step="0.01" placeholder="e.g. 5.00"
              value={ratePerHour} onChange={(e) => setRatePerHour(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg text-xs"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleEndSession} disabled={loading || !ratePerHour}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
              style={{
                background: loading || !ratePerHour ? "var(--color-border)" : "var(--color-primary)",
                color: loading || !ratePerHour ? "var(--color-muted)" : "#fff",
                cursor: loading || !ratePerHour ? "not-allowed" : "pointer",
              }}>
              {loading ? "Ending…" : "Confirm"}
            </button>
            <button onClick={() => { setShowEndForm(false); setError(null); }}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium border"
              style={{ borderColor: "var(--color-border)", color: "var(--color-muted)", background: "transparent" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && !showEndForm && (
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>Processing…</p>
      )}
    </div>
  );
}
