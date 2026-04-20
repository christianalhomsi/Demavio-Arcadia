"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { getBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
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
  const [pricePerHour, setPricePerHour] = useState<number>(0);

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
      .select("device_type_id, quantity")
      .eq("hall_id", selectedHallId)
      .gt("quantity", 0)
      .then(async ({ data: hallDevicesData, error: hallDevicesError }) => {
        if (hallDevicesError || !hallDevicesData || hallDevicesData.length === 0) {
          setDeviceTypes([]);
          setTypesLoading(false);
          return;
        }
        
        const typeIds = hallDevicesData.map(hd => hd.device_type_id);
        
        const { data: typesData } = await supabase
          .from("device_types")
          .select("id, name, name_ar, name_en, created_at")
          .in("id", typeIds);
        
        setDeviceTypes(typesData ?? []);
        setTypesLoading(false);
      }, () => {
        setTypesLoading(false);
      });
  }, [selectedHallId, setValue]);

  // لما يتغير النوع → جيب الأجهزة المتاحة من هذا النوع والسعر
  useEffect(() => {
    setDevices([]);
    setValue("device_id", "");
    setPricePerHour(0);
    if (!selectedHallId || !selectedTypeId) return;
    setDevicesLoading(true);
    const supabase = getBrowserClient();
    
    // جلب السعر من hall_devices
    void supabase
      .from("hall_devices")
      .select("price_per_hour")
      .eq("hall_id", selectedHallId)
      .eq("device_type_id", selectedTypeId)
      .single()
      .then(({ data }) => {
        if (data) setPricePerHour(data.price_per_hour || 0);
      });
    
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

  const handleSelectSlot = (start: Date | null, end: Date | null) => {
    if (start && end) {
      setSelectedSlot({ start, end });
    } else {
      setSelectedSlot(null);
    }
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
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="text-lg font-bold">{t("bookingDetails")}</CardTitle>
        <CardDescription className="text-xs sm:text-sm">{t("fillDetails")}</CardDescription>
      </CardHeader>
      <Separator className="opacity-40" />
      <CardContent className="pt-5 px-4 sm:px-6">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 sm:space-y-5">

          {/* الصالة */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("hall")}</Label>
            <Select value={selectedHallId} onValueChange={(v) => setValue("hall_id", v ?? "")}>
              <SelectTrigger className={e.hall_id ? "border-destructive h-10 sm:h-11" : "h-10 sm:h-11"}>
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
              <SelectTrigger className="h-10 sm:h-11">
                <SelectValue placeholder={
                  typesLoading ? t("booking") :
                  !selectedHallId ? t("selectHallFirst") :
                  deviceTypes.length === 0 ? t("noAvailableTypes") :
                  t("selectDeviceType")
                }>
                  {selectedTypeId ? (
                    locale === "ar" 
                      ? deviceTypes.find(dt => dt.id === selectedTypeId)?.name_ar 
                      : deviceTypes.find(dt => dt.id === selectedTypeId)?.name_en
                  ) : null}
                </SelectValue>
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
              <SelectTrigger className={e.device_id ? "border-destructive h-10 sm:h-11" : "h-10 sm:h-11"}>
                <SelectValue placeholder={
                  devicesLoading ? t("booking") :
                  !selectedTypeId ? t("selectTypeFirst") :
                  devices.length === 0 ? t("noAvailableDevices") :
                  t("selectDevice")
                }>
                  {selectedDeviceId ? devices.find(d => d.id === selectedDeviceId)?.name : null}
                </SelectValue>
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
            <Input type="date" className={e.booking_date ? "border-destructive h-10 sm:h-11" : "h-10 sm:h-11"} {...register("booking_date")} />
            {e.booking_date && <p className="text-xs text-destructive">{e.booking_date.message}</p>}
          </div>

          {/* اختيار الوقت */}
          {selectedDeviceId && bookingDate && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("selectTimeSlot")}
              </Label>
              <CalendarBooking
                key={`${selectedDeviceId}-${bookingDate}`}
                deviceId={selectedDeviceId}
                hallId={selectedHallId}
                selectedDate={new Date(bookingDate)}
                onSelectSlot={handleSelectSlot}
                pricePerHour={pricePerHour}
                locale={locale}
              />
            </div>
          )}

          {selectedSlot && (
            <div className="p-3 sm:p-4 rounded-lg bg-muted/50 space-y-2">
              <div className="text-xs sm:text-sm">
                <span className="text-muted-foreground">{t("selected")} </span>
                <span className="font-medium">
                  {selectedSlot.start.toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                  {" - "}
                  {selectedSlot.end.toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                </span>
              </div>
              {pricePerHour > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {locale === "ar" ? "السعر الإجمالي:" : "Total Price:"}
                  </span>
                  <span className="text-base sm:text-lg font-bold" style={{ color: "oklch(0.55 0.26 280)" }}>
                    {(() => {
                      const durationMs = selectedSlot.end.getTime() - selectedSlot.start.getTime();
                      const durationHours = durationMs / (1000 * 60 * 60);
                      const totalPrice = (durationHours * pricePerHour).toFixed(2);
                      return locale === "ar" ? `${totalPrice} ل.س` : `${totalPrice} SYP`;
                    })()}
                  </span>
                </div>
              )}
            </div>
          )}

          <Button type="submit" className="w-full cursor-pointer h-10 sm:h-11" disabled={isSubmitting}
            style={{ background: "oklch(0.55 0.26 280)", color: "white" }}>
            {isSubmitting ? t("booking") : t("confirmBooking")}
          </Button>

        </form>
      </CardContent>
    </Card>
  );
}
