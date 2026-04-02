"use client";

import { useState } from "react";
import type { DeviceStatus } from "@/services/devices";

export type StaffDeviceCardProps = {
  id: string;
  name: string;
  status: DeviceStatus;
  hallId: string;
  // present when status === "idle" (confirmed reservation waiting for check-in)
  pendingReservation: { id: string } | null;
  // present when status === "active"
  activeSession: { id: string; started_at: string } | null;
};

const STATUS_STYLE: Record<DeviceStatus, React.CSSProperties> = {
  available: { background: "#dcfce7", color: "#15803d" },
  active:    { background: "#dbeafe", color: "#1d4ed8" },
  offline:   { background: "#f3f4f6", color: "#6b7280" },
  idle:      { background: "#fef9c3", color: "#a16207" },
};

const STATUS_LABEL: Record<DeviceStatus, string> = {
  available: "Available",
  active:    "Active",
  offline:   "Offline",
  idle:      "Reserved",
};

function elapsed(startedAt: string): string {
  const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function StaffDeviceCard(props: StaffDeviceCardProps) {
  const { id, name, hallId, pendingReservation, activeSession } = props;

  const [status, setStatus]               = useState<DeviceStatus>(props.status);
  const [session, setSession]             = useState(activeSession);
  const [reservation, setReservation]     = useState(pendingReservation);
  const [ratePerHour, setRatePerHour]     = useState("");
  const [showEndForm, setShowEndForm]     = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  // ── check-in ──────────────────────────────────────────────────────────────
  async function handleCheckIn() {
    if (!reservation) return;
    setError(null);
    setLoading(true);
    const res = await fetch("/api/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservation_id: reservation.id,
        device_id: id,
        hall_id: hallId,
      }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setStatus("active");
      setSession({ id: data.id, started_at: data.started_at });
      setReservation(null);
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json?.error ?? "Check-in failed.");
    }
  }

  // ── end session ───────────────────────────────────────────────────────────
  async function handleEndSession() {
    if (!session) return;
    const rate = parseFloat(ratePerHour);
    if (!rate || rate <= 0) { setError("Enter a valid rate per hour."); return; }
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/sessions/${session.id}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hall_id: hallId, rate_per_hour: rate }),
    });
    setLoading(false);
    if (res.ok) {
      setStatus("available");
      setSession(null);
      setShowEndForm(false);
      setRatePerHour("");
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json?.error ?? "Failed to end session.");
    }
  }

  const badge = STATUS_STYLE[status] ?? STATUS_STYLE.offline;
  const label = STATUS_LABEL[status] ?? status;

  return (
    <div style={card}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
        <p style={deviceName}>{name}</p>
        <span style={{ ...badgeBase, ...badge }}>{label}</span>
      </div>

      {/* active session info */}
      {status === "active" && session && (
        <p style={sessionInfo}>
          Session running · {elapsed(session.started_at)}
        </p>
      )}

      {/* pending reservation info */}
      {status === "idle" && reservation && (
        <p style={sessionInfo}>Confirmed reservation waiting</p>
      )}

      {/* error */}
      {error && <span style={errorStyle}>{error}</span>}

      {/* check-in action */}
      {status === "idle" && reservation && !loading && (
        <button onClick={handleCheckIn} disabled={loading} style={primaryBtn(false)}>
          Check in
        </button>
      )}

      {/* end session action */}
      {status === "active" && session && !showEndForm && (
        <button onClick={() => { setShowEndForm(true); setError(null); }} style={dangerBtn}>
          End session
        </button>
      )}

      {showEndForm && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={fieldWrap}>
            <label style={labelStyle}>Rate / hour</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 5.00"
              value={ratePerHour}
              onChange={(e) => setRatePerHour(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={handleEndSession}
              disabled={loading || !ratePerHour}
              style={primaryBtn(loading || !ratePerHour)}
            >
              {loading ? "Ending…" : "Confirm"}
            </button>
            <button
              onClick={() => { setShowEndForm(false); setError(null); }}
              style={cancelBtn}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && !showEndForm && (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "#6b7280" }}>Processing…</p>
      )}
    </div>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  padding: "1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const deviceName: React.CSSProperties = {
  margin: 0,
  fontSize: "0.9375rem",
  fontWeight: 600,
  color: "#111827",
};

const badgeBase: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 500,
  padding: "0.2rem 0.6rem",
  borderRadius: "9999px",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const sessionInfo: React.CSSProperties = {
  margin: 0,
  fontSize: "0.8125rem",
  color: "#6b7280",
};

const errorStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#ef4444",
};

const fieldWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 500,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "0.375rem 0.5rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  fontSize: "0.8125rem",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  padding: "0.4rem 0.875rem",
  borderRadius: "0.375rem",
  border: "none",
  background: disabled ? "#9ca3af" : "#111827",
  color: "#fff",
  fontSize: "0.8125rem",
  fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
  alignSelf: "flex-start",
});

const dangerBtn: React.CSSProperties = {
  padding: "0.4rem 0.875rem",
  borderRadius: "0.375rem",
  border: "1px solid #fca5a5",
  background: "#fff",
  color: "#b91c1c",
  fontSize: "0.8125rem",
  fontWeight: 500,
  cursor: "pointer",
  alignSelf: "flex-start",
};

const cancelBtn: React.CSSProperties = {
  flex: 1,
  padding: "0.375rem",
  borderRadius: "0.375rem",
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#374151",
  fontSize: "0.8125rem",
  fontWeight: 500,
  cursor: "pointer",
};
