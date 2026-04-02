"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { bookingSchema } from "@/schemas/booking";
import { getBrowserClient } from "@/lib/supabase/client";
import type { Hall } from "@/types/hall";
import type { Device } from "@/services/devices";

type FormValues = {
  hall_id: string;
  device_id: string;
  start_time: string;
  end_time: string;
};

export default function BookingForm({ halls }: { halls: Hall[] }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(bookingSchema),
  });

  const selectedHallId = watch("hall_id");

  useEffect(() => {
    if (!selectedHallId) {
      setDevices([]);
      return;
    }
    setDevicesLoading(true);
    setValue("device_id", "");
    const supabase = getBrowserClient();
    supabase
      .from("devices")
      .select("id, hall_id, name, status, last_heartbeat")
      .eq("hall_id", selectedHallId)
      .eq("status", "available")
      .order("name", { ascending: true })
      .then(({ data }) => setDevices(data ?? []))
      .catch(() => setDevices([]))
      .finally(() => setDevicesLoading(false));
  }, [selectedHallId, setValue]);

  async function onSubmit(data: FormValues) {
    setServerError(null);
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.status === 201) {
      setSuccess(true);
      return;
    }

    const json = await res.json().catch(() => ({}));
    setServerError(json?.error ?? "Something went wrong. Please try again.");
  }

  if (success) {
    return (
      <div style={card}>
        <p style={{ color: "#16a34a", margin: 0, fontWeight: 500 }}>
          ✓ Reservation confirmed.
        </p>
      </div>
    );
  }

  return (
    <div style={card}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
      >
        {/* Hall */}
        <div style={fieldWrap}>
          <label htmlFor="hall_id" style={labelStyle}>Hall</label>
          <select
            id="hall_id"
            style={{ ...inputStyle, borderColor: errors.hall_id ? "#ef4444" : "#d1d5db" }}
            {...register("hall_id")}
          >
            <option value="">Select a hall…</option>
            {halls.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
          {errors.hall_id && <span style={errorStyle}>{errors.hall_id.message}</span>}
        </div>

        {/* Device */}
        <div style={fieldWrap}>
          <label htmlFor="device_id" style={labelStyle}>Device</label>
          <select
            id="device_id"
            disabled={!selectedHallId || devicesLoading}
            style={{
              ...inputStyle,
              borderColor: errors.device_id ? "#ef4444" : "#d1d5db",
              color: !selectedHallId ? "#9ca3af" : "inherit",
            }}
            {...register("device_id")}
          >
            <option value="">
              {devicesLoading ? "Loading…" : !selectedHallId ? "Select a hall first" : devices.length === 0 ? "No available devices" : "Select a device…"}
            </option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.status}
              </option>
            ))}
          </select>
          {errors.device_id && <span style={errorStyle}>{errors.device_id.message}</span>}
        </div>

        {/* Start time */}
        <div style={fieldWrap}>
          <label htmlFor="start_time" style={labelStyle}>Start time</label>
          <input
            id="start_time"
            type="datetime-local"
            style={{ ...inputStyle, borderColor: errors.start_time ? "#ef4444" : "#d1d5db" }}
            {...register("start_time")}
          />
          {errors.start_time && <span style={errorStyle}>{errors.start_time.message}</span>}
        </div>

        {/* End time */}
        <div style={fieldWrap}>
          <label htmlFor="end_time" style={labelStyle}>End time</label>
          <input
            id="end_time"
            type="datetime-local"
            style={{ ...inputStyle, borderColor: errors.end_time ? "#ef4444" : "#d1d5db" }}
            {...register("end_time")}
          />
          {errors.end_time && (
            <span style={errorStyle}>
              {typeof errors.end_time.message === "string"
                ? errors.end_time.message
                : "Invalid end time"}
            </span>
          )}
        </div>

        {serverError && <span style={errorStyle}>{serverError}</span>}

        <button type="submit" disabled={isSubmitting} style={btnStyle(isSubmitting)}>
          {isSubmitting ? "Booking…" : "Book"}
        </button>
      </form>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "0.75rem",
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  padding: "2rem",
  width: "100%",
  maxWidth: "480px",
};

const fieldWrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderRadius: "0.375rem",
  border: "1px solid",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  background: "#fff",
};

const errorStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#ef4444",
};

const btnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "0.625rem",
  borderRadius: "0.375rem",
  border: "none",
  background: disabled ? "#9ca3af" : "#111827",
  color: "#fff",
  fontWeight: 500,
  fontSize: "0.875rem",
  cursor: disabled ? "not-allowed" : "pointer",
});
