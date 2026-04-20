"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, Save, Monitor, Clock, Trash2 } from "lucide-react";
import WorkingHoursEditor from "@/components/ui/working-hours-editor";
import DeviceTypeSelector from "@/components/ui/device-type-selector";
import type { WorkingHours } from "@/types/hall";
import type { DeviceType, HallDevice } from "@/types/device-type";
import { getBrowserClient } from "@/lib/supabase/client";

type Device = {
  id: string;
  name: string;
  device_type_id: string;
  status: string;
};

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
  const [devices, setDevices]     = useState<{ device_type_id: string; quantity: number; price_per_hour: number }[]>(
    hallDevices.map(hd => ({ device_type_id: hd.device_type_id, quantity: hd.quantity, price_per_hour: hd.price_per_hour || 0 }))
  );
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [devicesToDelete, setDevicesToDelete] = useState<string[]>([]);
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

  useEffect(() => {
    const fetchDevices = async () => {
      const supabase = getBrowserClient();
      const { data } = await supabase
        .from("devices")
        .select("id, name, device_type_id, status")
        .eq("hall_id", hallId)
        .order("name", { ascending: true });
      
      if (data) {
        setAllDevices(data);
      }
    };
    fetchDevices();
  }, [hallId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error(t("hallName")); return; }
    
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
          devices_to_delete: devicesToDelete,
        }),
      });
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) { toast.error(typeof data.error === "string" ? data.error : t("saveChanges")); return; }
      toast.success(locale === "ar" ? "تم تحديث الصالة بنجاح!" : "Hall updated successfully!");
      router.push("/admin/halls");
      router.refresh();
    } catch (error) {
      toast.error("Request failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="min-h-[calc(100vh-12rem)] pb-20">

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        
        <div className="space-y-4 md:space-y-6">
          <div className="rounded-xl md:rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 md:gap-3 px-4 md:px-6 py-4 md:py-5 border-b border-border/40"
              style={{ background: "linear-gradient(135deg, oklch(0.55 0.26 280 / 0.08) 0%, oklch(0.55 0.26 280 / 0.03) 100%)" }}>
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.25)" }}>
                <Building2 size={16} className="md:w-[18px] md:h-[18px]" style={{ color: "oklch(0.65 0.22 280)" }} />
              </div>
              <div>
                <p className="text-sm md:text-base font-bold text-foreground">{t("hallInformation")}</p>
                <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5">{locale === "ar" ? "معلومات الصالة الأساسية" : "Basic hall details"}</p>
              </div>
            </div>
            <div className="p-4 md:p-6 space-y-4 md:space-y-5">
              <div className="space-y-1.5 md:space-y-2">
                <Label htmlFor="name" className="text-xs md:text-sm font-semibold text-foreground flex items-center gap-1.5 md:gap-2">
                  <Building2 size={13} className="md:w-[14px] md:h-[14px] text-muted-foreground" />
                  {t("hallName")}
                </Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Downtown Arena" required autoComplete="off" 
                  className="h-10 md:h-11 text-sm md:text-base" />
              </div>
              <div className="space-y-1.5 md:space-y-2">
                <Label htmlFor="address" className="text-xs md:text-sm font-semibold text-foreground flex items-center gap-1.5 md:gap-2">
                  <MapPin size={13} className="md:w-[14px] md:h-[14px] text-muted-foreground" />
                  {t("addressOptional")}
                </Label>
                <Input id="address" value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="123 Main St" autoComplete="off" 
                  className="h-10 md:h-11 text-sm md:text-base" />
              </div>
            </div>
          </div>

          <div className="rounded-xl md:rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 md:gap-3 px-4 md:px-6 py-4 md:py-5 border-b border-border/40"
              style={{ background: "linear-gradient(135deg, oklch(0.65 0.20 140 / 0.08) 0%, oklch(0.65 0.20 140 / 0.03) 100%)" }}>
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "oklch(0.65 0.20 140 / 0.15)", border: "1px solid oklch(0.65 0.20 140 / 0.25)" }}>
                <Clock size={16} className="md:w-[18px] md:h-[18px]" style={{ color: "oklch(0.65 0.20 140)" }} />
              </div>
              <div>
                <p className="text-sm md:text-base font-bold text-foreground">{t("workingHours")}</p>
                <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5">{locale === "ar" ? "أوقات عمل الصالة" : "Hall operating hours"}</p>
              </div>
            </div>
            <div className="p-4 md:p-6">
              <WorkingHoursEditor value={workingHours} onChange={setWorkingHours} />
            </div>
          </div>
        </div>

        <div className="space-y-4 md:space-y-6">
          <div className="rounded-xl md:rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 md:gap-3 px-4 md:px-6 py-4 md:py-5 border-b border-border/40"
              style={{ background: "linear-gradient(135deg, oklch(0.82 0.14 200 / 0.08) 0%, oklch(0.82 0.14 200 / 0.03) 100%)" }}>
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "oklch(0.82 0.14 200 / 0.15)", border: "1px solid oklch(0.82 0.14 200 / 0.25)" }}>
                <Monitor size={16} className="md:w-[18px] md:h-[18px]" style={{ color: "oklch(0.82 0.14 200)" }} />
              </div>
              <div className="flex-1">
                <p className="text-sm md:text-base font-bold text-foreground">{t("devices")}</p>
                <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5">{t("manageDeviceTypes")}</p>
              </div>
            </div>
            <div className="p-4 md:p-6">
              {allDevices.length > 0 && (
                <div className="mb-4 md:mb-6">
                  <p className="text-xs md:text-sm font-semibold text-foreground mb-2 md:mb-3">
                    {locale === "ar" ? "الأجهزة الموجودة حالياً:" : "Current Devices:"}
                  </p>
                  <div className="space-y-2 max-h-64 md:max-h-96 overflow-y-auto">
                    {allDevices
                      .filter(device => !devicesToDelete.includes(device.id))
                      .map((device) => {
                        const deviceType = deviceTypes.find(dt => dt.id === device.device_type_id);
                        const typeName = deviceType ? (locale === "ar" ? deviceType.name_ar : deviceType.name_en) : "Unknown";
                        
                        return (
                          <div key={device.id} className="flex items-center gap-2 md:gap-3 p-2.5 md:p-3 rounded-lg border border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors">
                            <Monitor size={13} className="md:w-[14px] md:h-[14px] text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-xs md:text-sm truncate">{device.name}</p>
                              <p className="text-[11px] md:text-xs text-muted-foreground">{typeName}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setDevicesToDelete([...devicesToDelete, device.id]);
                                toast.success(locale === "ar" ? "سيتم حذف هذا الجهاز عند الحفظ" : "Device will be deleted on save");
                              }}
                              className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                            >
                              <Trash2 size={13} className="md:w-[14px] md:h-[14px]" />
                            </button>
                          </div>
                        );
                      })}
                  </div>
                  
                  {devicesToDelete.length > 0 && (
                    <div className="mt-2 md:mt-3 p-2.5 md:p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                      <p className="text-[11px] md:text-xs text-destructive font-medium">
                        {locale === "ar" 
                          ? `سيتم حذف ${devicesToDelete.length} جهاز عند الحفظ` 
                          : `${devicesToDelete.length} device(s) will be deleted on save`}
                      </p>
                    </div>
                  )}
                  
                  <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-border/40">
                    <p className="text-xs md:text-sm font-semibold text-foreground mb-2 md:mb-3">
                      {locale === "ar" ? "إضافة أجهزة جديدة:" : "Add New Devices:"}
                    </p>
                  </div>
                </div>
              )}
              
              <DeviceTypeSelector
                deviceTypes={deviceTypes}
                value={devices}
                onChange={setDevices}
                locale={locale}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border/50 py-3 md:py-4 px-4 md:px-0 z-50">
        <div className="flex gap-2 md:gap-3 justify-end max-w-7xl mx-auto">
          <Button type="button" variant="outline" onClick={() => router.back()} className="h-10 md:h-11 px-4 md:px-6 text-sm md:text-base">
            {tCommon("cancel")}
          </Button>
          <Button type="submit" disabled={pending} className="gap-1.5 md:gap-2 font-semibold h-10 md:h-11 px-5 md:px-8 text-sm md:text-base"
            style={{ background: "oklch(0.55 0.26 280)", color: "white", boxShadow: "0 4px 14px oklch(0.55 0.26 280 / 0.3)" }}>
            {pending
              ? <span className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              : <Save size={15} className="md:w-4 md:h-4" />}
            {pending ? t("saving") : t("saveChanges")}
          </Button>
        </div>
      </div>
    </form>
  );
}
