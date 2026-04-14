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

const formSchema = z.object({
  hall_id:    z.string().min(1, "Select a hall"),
  device_id:  z.string().min(1, "Select a device"),
  start_time: z.string().min(1, "Required"),
  end_time:   z.string().min(1, "Required"),
});
type FormValues = z.infer<typeof formSchema>;
type E = Record<string, { message?: string } | undefined>;

export default function BookingForm({ halls }: { halls: Hall[] }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors: rawErrors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });
  const e = rawErrors as E;

  const selectedHallId = watch("hall_id");

  useEffect(() => {
    if (!selectedHallId) { setDevices([]); return; }
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
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.status === 201) { setSuccess(true); toast.success("Reservation confirmed!"); return; }
    const json = await res.json().catch(() => ({} as { error?: string }));
    const errMsg = (json?.error as string) ?? "Something went wrong.";
    if (errMsg === "OVERLAP") toast.error("Time slot already taken.");
    else toast.error(errMsg);
  }

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
            <Select onValueChange={(v) => setValue("hall_id", v as string)}>
              <SelectTrigger className={e.hall_id ? "border-destructive" : ""}>
                <SelectValue placeholder="Select a hall" />
              </SelectTrigger>
              <SelectContent>
                {halls.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {e.hall_id && <p className="text-xs text-destructive">{e.hall_id.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Device</Label>
            <Select onValueChange={(v) => setValue("device_id", v as string)} disabled={!selectedHallId || devicesLoading}>
              <SelectTrigger className={e.device_id ? "border-destructive" : ""}>
                <SelectValue placeholder={
                  devicesLoading ? "Loading..." :
                  !selectedHallId ? "Select a hall first" :
                  devices.length === 0 ? "No available devices" :
                  "Select a device"
                } />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {e.device_id && <p className="text-xs text-destructive">{e.device_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Start time</Label>
              <Input type="datetime-local"
                className={e.start_time ? "border-destructive" : ""}
                {...register("start_time")} />
              {e.start_time && <p className="text-xs text-destructive">{e.start_time.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">End time</Label>
              <Input type="datetime-local"
                className={e.end_time ? "border-destructive" : ""}
                {...register("end_time")} />
              {e.end_time && <p className="text-xs text-destructive">{e.end_time.message}</p>}
            </div>
          </div>

          <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}
            style={{ background: "oklch(0.55 0.26 280)", color: "white" }}>
            {isSubmitting ? "Booking..." : "Confirm Booking"}
          </Button>

        </form>
      </CardContent>
    </Card>
  );
}
