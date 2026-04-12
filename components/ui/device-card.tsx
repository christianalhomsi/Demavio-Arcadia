"use client";

import { useState } from "react";
import type { Device, DeviceStatus } from "@/services/devices";

const STATUS: Record<DeviceStatus, { bg: string; color: string; label: string }> = {
  available: { bg: "#14532d33", color: "#22c55e", label: "Available" },
  active:    { bg: "#1e3a5f33", color: "#60a5fa", label: "Active" },
  offline:   { bg: "#1f212833", color: "#6b7280", label: "Offline" },
  idle:      { bg: "#78350f33", color: "#f59e0b", label: "Reserved" },
};

export default function DeviceCard({ device, hallId }: { device: Device; hallId: string }) {
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
      body: JSON.stringify({ hall_id: hallId, device_id: device.id, start_time: startTime, end_time: endTime }),
    });
    setLoading(false);
    if (res.ok) { setBooked(true); setOpen(false); }
    else {
      const json = await res.json().catch(() => ({}));
      setError(json?.error ?? "Booking failed. Please try again.");
    }
  }

  const s = STATUS[device.status] ?? STATUS.offline;
  const canBook = device.status === "available" && !booked;

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{device.name}</p>
        <span className="text-xs font-medium px-2.5 py-0.5 rounded-full shrink-0"
          style={{ background: s.bg, color: s.color }}>
          {booked ? "Reserved" : s.label}
        </span>
      </div>

      {canBook && !open && (
        <button onClick={() => setOpen(true)}
          className="self-start px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
          style={{ background: "var(--color-primary)", color: "#fff" }}>
          Book
        </button>
      )}

      {open && (
        <div className="flex flex-col gap-3">
          <TimeField label="Start" value={startTime} onChange={setStartTime} />
          <TimeField label="End" value={endTime} onChange={setEndTime} />
          {error && <span className="text-xs" style={{ color: "var(--color-danger)" }}>{error}</span>}
          <div className="flex gap-2">
            <button onClick={handleBook} disabled={loading || !startTime || !endTime}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-opacity"
              style={{
                background: loading || !startTime || !endTime ? "var(--color-border)" : "var(--color-primary)",
                color: loading || !startTime || !endTime ? "var(--color-muted)" : "#fff",
                cursor: loading || !startTime || !endTime ? "not-allowed" : "pointer",
              }}>
              {loading ? "Booking…" : "Confirm"}
            </button>
            <button onClick={() => { setOpen(false); setError(null); }}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium border"
              style={{ borderColor: "var(--color-border)", color: "var(--color-muted)", background: "transparent" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{label}</label>
      <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 rounded-lg text-xs"
        style={{
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text)",
        }} />
    </div>
  );
}
