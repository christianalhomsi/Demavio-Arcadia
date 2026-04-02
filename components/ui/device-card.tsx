"use client";

import { useState } from "react";
import type { Device, DeviceStatus } from "@/services/devices";

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

export default function DeviceCard({
  device,
  hallId,
}: {
  device: Device;
  hallId: string;
}) {
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  async function handleBook() {
    setError(null);
    setLoading(true);
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hall_id: hallId,
        device_id: device.id,
        start_time: startTime,
        end_time: endTime,
      }),
    });
    setLoading(false);
    if (res.ok) {
      setBooked(true);
      setOpen(false);
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json?.error ?? "Booking failed. Please try again.");
    }
  }

  const badge = STATUS_STYLE[device.status] ?? STATUS_STYLE.offline;
  const label = STATUS_LABEL[device.status] ?? device.status;
  const canBook = device.status === "available" && !booked;

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <p style={deviceName}>{device.name}</p>
        <span style={{ ...badgeBase, ...badge }}>{booked ? "Reserved" : label}</span>
      </div>

      {canBook && !open && (
        <button onClick={() => setOpen(true)} style={bookBtn}>
          Book
        </button>
      )}

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={fieldWrap}>
            <label style={labelStyle}>Start</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>End</label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={inputStyle}
            />
          </div>
          {error && <span style={errorStyle}>{error}</span>}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={handleBook}
              disabled={loading || !startTime || !endTime}
              style={confirmBtn(loading || !startTime || !endTime)}
            >
              {loading ? "Booking…" : "Confirm"}
            </button>
            <button onClick={() => { setOpen(false); setError(null); }} style={cancelBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
};

const bookBtn: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "0.375rem 0.875rem",
  borderRadius: "0.375rem",
  border: "none",
  background: "#111827",
  color: "#fff",
  fontSize: "0.8125rem",
  fontWeight: 500,
  cursor: "pointer",
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

const errorStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#ef4444",
};

const confirmBtn = (disabled: boolean): React.CSSProperties => ({
  flex: 1,
  padding: "0.375rem",
  borderRadius: "0.375rem",
  border: "none",
  background: disabled ? "#9ca3af" : "#111827",
  color: "#fff",
  fontSize: "0.8125rem",
  fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
});

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
