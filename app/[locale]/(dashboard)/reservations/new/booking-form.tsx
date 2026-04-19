"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { getBrowserClient } from "@/lib/supabase/client";
import type { Hall } from "@/types/hall";
import type { Device } from "@/services/devices";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import CalendarBooking from "@/components/ui/calendar-booking";

const formSchema = z.object({
  hall_id:    z.string().min(1, "Select a hall"),
  device_id:  z.string().min(1, "Select a device"),
  booking_date: z.string().min(1, "Required"),
  start_time: z.string().optional(),
  end_time:   z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;
type E = Record<string, { message?: string } | undefined>;

export default function BookingForm({ halls }: { halls: Hall[] }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors: rawErrors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      hall_id: "",
      device_id: "",
      booking_date: new Date().toISOString().split('T')[0],
    },
  });
  const e = rawErrors as E;

  const selectedHallId = watch("hall_id");
  const selectedDeviceId = watch("device_id");
  const bookingDate = watch("booking_date");

  useEffect(() => {
    if (!selectedHallId) { 
      setDevices([]); 
      return; 
    }
    setDevicesLoading(true);
    setValue("device_id", "");
    const supabase = getBrowserClient();
    void Promise.resolve(
      supabase.from("devices").select("id, hall_id, name, status, last_heartbeat")
        .eq("hall_id", selectedHallId).eq("status", "available").order("name", { ascending: true })
    ).then(({ data }) => { setDevices(data ?? []); setDevicesLoading(false); })
      .catch(() => { setDevices([]); setDevicesLoading(false); });
  }, [selectedHallId, setValue]);

  async function onSubmit(data: FormValues) {
    if (!selectedSlot) {
      toast.error("Please select a time slot");
      return;
    }

    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        start_time: selectedSlot.start.toISOString(),
        end_time: selectedSlot.end.toISOString(),
      }),
    });
    if (res.status === 201) { setSuccess(true); toast.success("Reservation confirmed!"); return; }
    const json = await res.json().catch(() => ({} as { error?: string }));
    const errMsg = (json?.error as string) ?? "Something went wrong.";
    if (errMsg === "OVERLAP") toast.error("Time slot already taken.");
    else toast.error(errMsg);
  }

  const handleSelectSlot = (start: Date, end: Date) => {
    setSelectedSlot({ start, end });
    setValue("start_time", start.toISOString());
    setValue("end_time", end.toISOString());
  };

  if (success) {
    return (
      <Card className="border-border/60 text-center py-12">
        <CardContent>
          <div className="text-5xl mb-4">checkmark</div>
          <p className="text-lg font-bold text-foreground mb-1">Reservation confirmed!</p>
          <p className="text-sm text-muted-foreground">Your device has been booked successfully.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">Booking details</CardTitle>
        <CardDescription>Fill in the details to reserve a device</CardDescription>
      </CardHeader>
      <Separator className="opacity-40" />
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hall</Label>
            <Select value={selectedHallId} onValueChange={(v) => setValue("hall_id", v as string)}>
              <SelectTrigger className={e.hall_id ? "border-destructive" : ""}>
                <SelectValue placeholder="Select a hall">
                  {selectedHallId ? halls.find(h => h.id === selectedHallId)?.name : "Select a hall"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {halls.map((h) => <SelectItem key={h.id} value={h.id} label={h.name}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {e.hall_id && <p className="text-xs text-destructive">{e.hall_id.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Device</Label>
            <Select value={selectedDeviceId} onValueChange={(v) => setValue("device_id", v as string)} disabled={!selectedHallId || devicesLoading}>
              <SelectTrigger className={e.device_id ? "border-destructive" : ""}>
                <SelectValue placeholder={
                  devicesLoading ? "Loading..." :
                  !selectedHallId ? "Select a hall first" :
                  devices.length === 0 ? "No available devices" :
                  "Select a device"
                }>
                  {selectedDeviceId ? devices.find(d => d.id === selectedDeviceId)?.name : (
                    devicesLoading ? "Loading..." :
                    !selectedHallId ? "Select a hall first" :
                    devices.length === 0 ? "No available devices" :
                    "Select a device"
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => <SelectItem key={d.id} value={d.id} label={d.name}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {e.device_id && <p className="text-xs text-destructive">{e.device_id.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Booking Date</Label>
            <Input type="date"
              className={e.booking_date ? "border-destructive" : ""}
              {...register("booking_date")} />
            {e.booking_date && <p className="text-xs text-destructive">{e.booking_date.message}</p>}
          </div>

          {selectedDeviceId && bookingDate && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Select Time Slot (30 min)
              </Label>
              <CalendarBooking
                deviceId={selectedDeviceId}
                hallId={selectedHallId}
                selectedDate={new Date(bookingDate)}
                onSelectSlot={handleSelectSlot}
              />
            </div>
          )}

          {selectedSlot && (
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <span className="text-muted-foreground">Selected: </span>
              <span className="font-medium">
                {selectedSlot.start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                {" - "}
                {selectedSlot.end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
              </span>
            </div>
          )}

          <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}
            style={{ background: "oklch(0.55 0.26 280)", color: "white" }}>
            {isSubmitting ? "Booking..." : "Confirm Booking"}
          </Button>

        </form>
      </CardContent>
    </Card>
  );
}
