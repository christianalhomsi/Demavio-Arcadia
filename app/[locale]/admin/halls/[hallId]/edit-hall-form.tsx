"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, Save, Monitor, Clock } from "lucide-react";
import WorkingHoursEditor from "@/components/ui/working-hours-editor";
import DeviceTypeSelector from "@/components/ui/device-type-selector";
import type { WorkingHours } from "@/types/hall";
import type { DeviceType, HallDevice } from "@/types/device-type";

export default function EditHallForm({ 
  hallId, 
  defaultName, 
  defaultAddress, 
  defaultWorkingHours,
  deviceTypes,
  hallDevices,
  locale
}: {
  hallId: string;
  defaultName: string;
  defaultAddress: string;
  defaultWorkingHours?: WorkingHours[] | null;
  deviceTypes: DeviceType[];
  hallDevices: HallDevice[];
  locale: string;
}) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [name, setName]           = useState(defaultName);
  const [address, setAddress]     = useState(defaultAddress);
  const [devices, setDevices]     = useState<{ device_type_id: string; quantity: number }[]>(
    hallDevices.map(hd => ({ device_type_id: hd.device_type_id, quantity: hd.quantity }))
  );
  const [pending, setPending]     = useState(false);
  const [workingHours, setWorkingHours] = useState<WorkingHours[]>(
    defaultWorkingHours || [
      { day: 0, open_time: "09:00", close_time: "23:00", is_open: true },
      { day: 1, open_time: "09:00", close_time: "23:00", is_open: true },
      { day: 2, open_time: "09:00", close_time: "23:00", is_open: true },
      { day: 3, open_time: "09:00", close_time: "23:00", is_open: true },
      { day: 4, open_time: "09:00", close_time: "23:00", is_open: true },
      { day: 5, open_time: "09:00", close_time: "23:00", is_open: true },
      { day: 6, open_time: "09:00", close_time: "23:00", is_open: true },
    ]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error(t("hallName")); return; }
    if (devices.length === 0) {
      toast.error(locale === "ar" ? "يجب إضافة نوع جهاز واحد على الأقل" : "At least one device type is required");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/admin/halls/${hallId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || null,
          devices,
          working_hours: workingHours,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(typeof data.error === "string" ? data.error : t("saveChanges")); return; }
      toast.success(locale === "ar" ? "تم تحديث الصالة بنجاح!" : "Hall updated successfully!");
      router.push("/admin/halls");
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-lg">

      {/* Hall info */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40"
          style={{ background: "oklch(0.55 0.26 280 / 0.05)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.25)" }}>
            <Building2 size={15} style={{ color: "oklch(0.65 0.22 280)" }} />
          </div>
          <p className="text-sm font-semibold text-foreground">{t("hallInformation")}</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-medium text-muted-foreground">{t("hallName")}</Label>
            <div className="relative">
              <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
              <Input id="name" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Downtown Arena" required autoComplete="off" className="pl-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address" className="text-xs font-medium text-muted-foreground">{t("addressOptional")}</Label>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
              <Input id="address" value={address} onChange={e => setAddress(e.target.value)}
                placeholder="123 Main St" autoComplete="off" className="pl-9" />
            </div>
          </div>
        </div>
      </div>

      {/* Devices */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40"
          style={{ background: "oklch(0.82 0.14 200 / 0.05)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "oklch(0.82 0.14 200 / 0.15)", border: "1px solid oklch(0.82 0.14 200 / 0.25)" }}>
            <Monitor size={15} style={{ color: "oklch(0.82 0.14 200)" }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">{t("devices")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("manageDeviceTypes")}</p>
          </div>
        </div>
        <div className="p-5">
          <DeviceTypeSelector
            deviceTypes={deviceTypes}
            value={devices}
            onChange={setDevices}
            locale={locale}
          />
        </div>
      </div>

      {/* Working Hours */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40"
          style={{ background: "oklch(0.65 0.20 140 / 0.05)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "oklch(0.65 0.20 140 / 0.15)", border: "1px solid oklch(0.65 0.20 140 / 0.25)" }}>
            <Clock size={15} style={{ color: "oklch(0.65 0.20 140)" }} />
          </div>
          <p className="text-sm font-semibold text-foreground">{t("workingHours")}</p>
        </div>
        <div className="p-5">
          <WorkingHoursEditor value={workingHours} onChange={setWorkingHours} />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending} className="gap-2 font-semibold"
          style={{ background: "oklch(0.55 0.26 280)", color: "white", boxShadow: "0 4px 14px oklch(0.55 0.26 280 / 0.3)" }}>
          {pending
            ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            : <Save size={15} />}
          {pending ? t("saving") : t("saveChanges")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tCommon("cancel")}
        </Button>
      </div>
    </form>
  );
}
