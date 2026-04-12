"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { bookingSchema } from "@/schemas/booking";
import { getBrowserClient } from "@/lib/supabase/client";
import type { Hall } from "@/types/hall";
import type { Device } from "@/services/devices";

type FormValues = { hall_id: string; device_id: string; start_time: string; end_time: string };

export default function BookingForm({ halls }: { halls: Hall[] }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(bookingSchema),
  });

  const selectedHallId = watch("hall_id");

  useEffect(() => {
    if (!selectedHallId) { setDevices([]); return; }
    setDevicesLoading(true);
    setValue("device_id", "");
    const supabase = getBrowserClient();
    supabase.from("devices").select("id, hall_id, name, status, last_heartbeat")
      .eq("hall_id", selectedHallId).eq("status", "available").order("name", { ascending: true })
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
    if (res.status === 201) { setSuccess(true); return; }
    const json = await res.json().catch(() => ({}));
    setServerError(json?.error ?? "Something went wrong. Please try again.");
  }

  if (success) {
    return (
      <div className="rounded-xl border p-8 text-center"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
        <div className="text-4xl mb-3">✅</div>
        <p className="font-semibold" style={{ color: "var(--color-success)" }}>Reservation confirmed!</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-6 w-full max-w-md"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <SelectField label="Hall" id="hall_id" error={errors.hall_id?.message} reg={register("hall_id")}>
          <option value="">Select a hall…</option>
          {halls.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </SelectField>

        <SelectField label="Device" id="device_id" error={errors.device_id?.message}
          reg={register("device_id")} disabled={!selectedHallId || devicesLoading}>
          <option value="">
            {devicesLoading ? "Loading…" : !selectedHallId ? "Select a hall first" : devices.length === 0 ? "No available devices" : "Select a device…"}
          </option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </SelectField>

        <InputField label="Start time" id="start_time" type="datetime-local"
          error={errors.start_time?.message} reg={register("start_time")} />
        <InputField label="End time" id="end_time" type="datetime-local"
          error={typeof errors.end_time?.message === "string" ? errors.end_time.message : undefined}
          reg={register("end_time")} />

        {serverError && <span className="text-xs" style={{ color: "var(--color-danger)" }}>{serverError}</span>}

        <button type="submit" disabled={isSubmitting}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: isSubmitting ? "var(--color-border)" : "var(--color-primary)",
            color: isSubmitting ? "var(--color-muted)" : "#fff",
            cursor: isSubmitting ? "not-allowed" : "pointer",
          }}>
          {isSubmitting ? "Booking…" : "Book"}
        </button>
      </form>
    </div>
  );
}

const fieldBase = "w-full px-3 py-2.5 rounded-lg text-sm";
const fieldStyle = { background: "var(--color-surface-2)", color: "var(--color-text)" };

function InputField({ label, id, type, error, reg }: {
  label: string; id: string; type: string; error?: string; reg: object;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide"
        style={{ color: "var(--color-muted)" }}>{label}</label>
      <input id={id} type={type}
        className={fieldBase}
        style={{ ...fieldStyle, border: `1px solid ${error ? "var(--color-danger)" : "var(--color-border)"}` }}
        {...reg} />
      {error && <span className="text-xs" style={{ color: "var(--color-danger)" }}>{error}</span>}
    </div>
  );
}

function SelectField({ label, id, error, reg, disabled, children }: {
  label: string; id: string; error?: string; reg: object; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide"
        style={{ color: "var(--color-muted)" }}>{label}</label>
      <select id={id} disabled={disabled}
        className={fieldBase}
        style={{ ...fieldStyle, border: `1px solid ${error ? "var(--color-danger)" : "var(--color-border)"}`, opacity: disabled ? 0.5 : 1 }}
        {...reg}>
        {children}
      </select>
      {error && <span className="text-xs" style={{ color: "var(--color-danger)" }}>{error}</span>}
    </div>
  );
}
