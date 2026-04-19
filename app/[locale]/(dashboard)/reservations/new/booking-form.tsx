"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { getBrowserClient } from "@/lib/supabase/client";
import type { Hall } from "@/types/hall";
import type { Device } from "@/services/devices";
import type { DeviceType } from "@/types/device-type";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import CalendarBooking from "@/components/ui/calendar-booking";

const formSchema = z.object({
  hall_id:      z.string().min(1, "Select a hall"),
  device_id:    z.string().min(1, "Select a device"),
  booking_date: z.string().min(1, "Required"),
  start_time:   z.string().optional(),
  end_time:     z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;
type E = Record<string, { message?: string } | undefined>;

export default function BookingForm({ halls, locale }: { halls: Hall[]; locale: string }) {
  const t = useTranslations("reservations");
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [devices, setDevices]         = useState<Device[]>([]);
  const [typesLoading, setTypesLoading]   = useState(false);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [success, setSuccess]         = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors: rawErrors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { hall_id: "", device_id: "", booking_date: new Date().toISOString().split('T')[0] },
  });
  const e = rawErrors as E;

  const selectedHallId   = watch("hall_id");
  const selectedDeviceId = watch("device_id");
  const bookingDate      = watch("booking_date");

  // لما يتغير الهول → جيب أنواع الأجهزة المتاحة
  useEffect(() => {
    setDeviceTypes([]);
    setDevices([]);
    setSelectedTypeId("");
    setValue("device_id", "");
    if (!selectedHallId) return;
    setTypesLoading(true);
    const supabase = getBrowserClient();
    void supabase
      .from("hall_devices")
      .select("device_type_id, device_types(id, name, name_ar, name_en)")
      .eq("hall_id", selectedHallId)
      .gt("quantity", 0)
      .then(({ data }) => {
        const types = (data ?? []).map((r: any) => r.device_types).filter(Boolean);
        setDeviceTypes(types);
        setTypesLoading(false);
      }, () => setTypesLoading(false));
  }, [selectedHallId, setValue]);

  // لما يتغير النوع → جيب الأجهزة المتاحة من هذا النوع
  useEffect(() => {
    setDevices([]);
    setValue("device_id", "");
    if (!selectedHallId || !selectedTypeId) return;
    setDevicesLoading(true);
    const supabase = getBrowserClient();
    void supabase
      .from("devices")
      .select("id, hall_id, name, status, last_heartbeat, device_type_id")
      .eq("hall_id", selectedHallId)
      .eq("device_type_id", selectedTypeId)
      .eq("status", "available")
      .order("name", { ascending: true })
      .then(({ data }) => { setDevices(data ?? []); setDevicesLoading(false); }, () => setDevicesLoading(false));
  }, [selectedHallId, selectedTypeId, setValue]);

  async function onSubmit(data: FormValues) {
    if (!selectedSlot) { toast.error(t("selectTimeSlotError")); return; }
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, start_time: selectedSlot.start.toISOString(), end_time: selectedSlot.end.toISOString() }),
    });
    if (res.status === 201) { setSuccess(true); toast.success(t("reservationConfirmedMsg")); return; }
    const json = await res.json().catch(() => ({} as { error?: string }));
    const errMsg = (json?.error as string) ?? "Something went wrong.";
    if (errMsg === "OVERLAP") toast.error(t("timeSlotTaken"));
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
          <div className="text-5xl mb-4">✅</div>
          <p className="text-lg font-bold text-foreground mb-1">{t("reservationConfirmedMsg")}</p>
          <p className="text-sm text-muted-foreground">{t("deviceBookedSuccess")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{t("bookingDetails")}</CardTitle>
        <CardDescription>{t("fillDetails")}</CardDescription>
      </CardHeader>
      <Separator className="opacity-40" />
      <CardContent className="pt-5">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

          {/* الصالة */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("hall")}</Label>
            <Select value={selectedHallId} onValueChange={(v) => setValue("hall_id", v ?? "")}>
              <SelectTrigger className={e.hall_id ? "border-destructive" : ""}>
                <SelectValue placeholder={t("selectHall")}>
                  {selectedHallId ? halls.find(h => h.id === selectedHallId)?.name : t("selectHall")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {halls.map((h) => <SelectItem key={h.id} value={h.id} label={h.name}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {e.hall_id && <p className="text-xs text-destructive">{e.hall_id.message}</p>}
          </div>

          {/* نوع الجهاز */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("deviceType")}</Label>
            <Select value={selectedTypeId} onValueChange={(v) => setSelectedTypeId(v ?? "")} disabled={!selectedHallId || typesLoading}>
              <SelectTrigger>
                <SelectValue placeholder={
                  typesLoading ? t("booking") :
                  !selectedHallId ? t("selectHallFirst") :
                  deviceTypes.length === 0 ? t("noAvailableTypes") :
                  t("selectDeviceType")
                } />
              </SelectTrigger>
              <SelectContent>
                {deviceTypes.map((dt) => (
                  <SelectItem key={dt.id} value={dt.id} label={locale === "ar" ? dt.name_ar : dt.name_en}>
                    {locale === "ar" ? dt.name_ar : dt.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* الجهاز */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("device")}</Label>
            <Select value={selectedDeviceId} onValueChange={(v) => setValue("device_id", v ?? "")} disabled={!selectedTypeId || devicesLoading}>
              <SelectTrigger className={e.device_id ? "border-destructive" : ""}>
                <SelectValue placeholder={
                  devicesLoading ? t("booking") :
                  !selectedTypeId ? t("selectTypeFirst") :
                  devices.length === 0 ? t("noAvailableDevices") :
                  t("selectDevice")
                } />
              </SelectTrigger>
              <SelectContent>
                {devices.map((d) => <SelectItem key={d.id} value={d.id} label={d.name}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {e.device_id && <p className="text-xs text-destructive">{e.device_id.message}</p>}
          </div>

          {/* تاريخ الحجز */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("bookingDate")}</Label>
            <Input type="date" className={e.booking_date ? "border-destructive" : ""} {...register("booking_date")} />
            {e.booking_date && <p className="text-xs text-destructive">{e.booking_date.message}</p>}
          </div>

          {/* اختيار الوقت */}
          {selectedDeviceId && bookingDate && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("selectTimeSlot")}
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
              <span className="text-muted-foreground">{t("selected")} </span>
              <span className="font-medium">
                {selectedSlot.start.toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                {" - "}
                {selectedSlot.end.toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
              </span>
            </div>
          )}

          <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}
            style={{ background: "oklch(0.55 0.26 280)", color: "white" }}>
            {isSubmitting ? t("booking") : t("confirmBooking")}
          </Button>

        </form>
      </CardContent>
    </Card>
  );
}
