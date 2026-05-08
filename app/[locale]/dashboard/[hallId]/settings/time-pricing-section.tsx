"use client";

import { useState } from "react";
import { DollarSign, Plus, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type DeviceType = {
  id: string;
  name_ar: string;
  name_en: string;
};

type TimePricing = {
  id?: string;
  device_type_id: string;
  start_time: string;
  end_time: string;
  price_per_hour: number;
};

type Props = {
  hallId: string;
  locale: string;
  deviceTypes: DeviceType[];
  timePricing: TimePricing[];
  defaultPricing: Array<{ device_type_id: string; price_per_hour: number }>;
};

export default function TimePricingSection({
  hallId,
  locale,
  deviceTypes,
  timePricing,
  defaultPricing,
}: Props) {
  const [selectedType, setSelectedType] = useState<string>("");
  const [pricing, setPricing] = useState<Record<string, TimePricing[]>>(
    timePricing.reduce((acc, p) => {
      if (!acc[p.device_type_id]) acc[p.device_type_id] = [];
      acc[p.device_type_id].push(p);
      return acc;
    }, {} as Record<string, TimePricing[]>)
  );
  const [defaults, setDefaults] = useState<Record<string, number>>(
    defaultPricing.reduce((acc, d) => {
      acc[d.device_type_id] = d.price_per_hour;
      return acc;
    }, {} as Record<string, number>)
  );
  const [saving, setSaving] = useState(false);

  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      ar: {
        devicePricing: "أسعار الأجهزة",
        devicePricingDesc: "حدد سعر الساعة لكل نوع جهاز حسب الوقت",
        selectDeviceType: "اختر نوع الجهاز",
        defaultPrice: "السعر الافتراضي",
        defaultPriceDesc: "السعر المستخدم عندما لا يوجد سعر محدد حسب الوقت",
        timePricing: "الأسعار حسب الوقت",
        timePricingDesc: "أضف أسعار مختلفة لأوقات مختلفة من اليوم",
        addTimeSlot: "إضافة فترة زمنية",
        from: "من",
        to: "إلى",
        pricePerHour: "السعر/ساعة",
        saveChanges: "حفظ التغييرات",
        saving: "جاري الحفظ...",
        updated: "تم تحديث الأسعار بنجاح",
        updateError: "فشل تحديث الأسعار",
        noDeviceTypes: "لا توجد أنواع أجهزة",
        selectType: "اختر نوع جهاز لتعديل أسعاره",
        noTimeSlots: "لا توجد فترات زمنية محددة",
        addFirstSlot: "أضف فترة زمنية لتحديد أسعار مختلفة حسب الوقت",
      },
      en: {
        devicePricing: "Device Pricing",
        devicePricingDesc: "Set hourly rates for each device type by time",
        selectDeviceType: "Select Device Type",
        defaultPrice: "Default Price",
        defaultPriceDesc: "Price used when no time-based pricing is set",
        timePricing: "Time-Based Pricing",
        timePricingDesc: "Add different prices for different times of day",
        addTimeSlot: "Add Time Slot",
        from: "From",
        to: "To",
        pricePerHour: "Price/Hour",
        saveChanges: "Save Changes",
        saving: "Saving...",
        updated: "Pricing updated successfully",
        updateError: "Failed to update pricing",
        noDeviceTypes: "No device types",
        selectType: "Select a device type to edit its pricing",
        noTimeSlots: "No time slots defined",
        addFirstSlot: "Add a time slot to set different prices by time",
      },
    };
    return translations[locale]?.[key] || key;
  };

  const addTimeSlot = () => {
    if (!selectedType) return;
    const newSlot: TimePricing = {
      device_type_id: selectedType,
      start_time: "09:00",
      end_time: "17:00",
      price_per_hour: defaults[selectedType] || 10,
    };
    setPricing({
      ...pricing,
      [selectedType]: [...(pricing[selectedType] || []), newSlot],
    });
  };

  const removeTimeSlot = (typeId: string, index: number) => {
    setPricing({
      ...pricing,
      [typeId]: pricing[typeId].filter((_, i) => i !== index),
    });
  };

  const updateTimeSlot = (typeId: string, index: number, updates: Partial<TimePricing>) => {
    setPricing({
      ...pricing,
      [typeId]: pricing[typeId].map((slot, i) => (i === index ? { ...slot, ...updates } : slot)),
    });
  };

  const updateDefault = (typeId: string, price: number) => {
    setDefaults({ ...defaults, [typeId]: price });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save default pricing
      const defaultRes = await fetch(`/api/dashboard/halls/${hallId}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prices: Object.entries(defaults).reduce((acc, [typeId, price]) => {
            const device = deviceTypes.find((d) => d.id === typeId);
            if (device) {
              // Find any device of this type to update
              acc[typeId] = price;
            }
            return acc;
          }, {} as Record<string, number>),
        }),
      });

      // Save time-based pricing
      const timeRes = await fetch(`/api/halls/${hallId}/time-pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricing }),
      });

      if (!defaultRes.ok || !timeRes.ok) throw new Error();
      toast.success(t("updated"));
    } catch {
      toast.error(t("updateError"));
    } finally {
      setSaving(false);
    }
  };

  if (deviceTypes.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("noDeviceTypes")}</p>
      </div>
    );
  }

  const selectedDevice = deviceTypes.find((d) => d.id === selectedType);
  const deviceName = selectedDevice
    ? locale === "ar"
      ? selectedDevice.name_ar
      : selectedDevice.name_en
    : "";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div
          className="flex items-center gap-3 px-6 py-5 border-b border-border/40"
          style={{ background: "oklch(0.65 0.20 140 / 0.05)" }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "oklch(0.65 0.20 140 / 0.15)",
              border: "1px solid oklch(0.65 0.20 140 / 0.25)",
            }}
          >
            <DollarSign size={18} style={{ color: "oklch(0.65 0.20 140)" }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t("devicePricing")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("devicePricingDesc")}</p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Device Type Selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("selectDeviceType")}</Label>
            <Select value={selectedType} onValueChange={(value) => setSelectedType(value || "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("selectDeviceType")} />
              </SelectTrigger>
              <SelectContent>
                {deviceTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {locale === "ar" ? type.name_ar : type.name_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedType ? (
            <>
              {/* Default Price */}
              <div className="p-5 rounded-xl border border-border/40 bg-muted/20 space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign size={16} className="text-muted-foreground" />
                  <div>
                    <h3 className="text-sm font-semibold">{t("defaultPrice")}</h3>
                    <p className="text-xs text-muted-foreground">{t("defaultPriceDesc")}</p>
                  </div>
                </div>
                <Input
                  type="number"
                  value={defaults[selectedType] || 0}
                  onChange={(e) => updateDefault(selectedType, parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full"
                />
              </div>

              {/* Time-Based Pricing */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-muted-foreground" />
                    <div>
                      <h3 className="text-sm font-semibold">{t("timePricing")}</h3>
                      <p className="text-xs text-muted-foreground">{t("timePricingDesc")}</p>
                    </div>
                  </div>
                  <Button
                    onClick={addTimeSlot}
                    size="sm"
                    className="gap-2"
                    style={{
                      background: "oklch(0.65 0.20 140)",
                      color: "white",
                    }}
                  >
                    <Plus size={16} />
                    {t("addTimeSlot")}
                  </Button>
                </div>

                {!pricing[selectedType] || pricing[selectedType].length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <p>{t("noTimeSlots")}</p>
                    <p className="text-xs mt-1">{t("addFirstSlot")}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pricing[selectedType].map((slot, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-muted/20"
                      >
                        <div className="flex-1 grid grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t("from")}</Label>
                            <Input
                              type="time"
                              value={slot.start_time}
                              onChange={(e) =>
                                updateTimeSlot(selectedType, index, { start_time: e.target.value })
                              }
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t("to")}</Label>
                            <Input
                              type="time"
                              value={slot.end_time}
                              onChange={(e) =>
                                updateTimeSlot(selectedType, index, { end_time: e.target.value })
                              }
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              {t("pricePerHour")}
                            </Label>
                            <Input
                              type="number"
                              value={slot.price_per_hour}
                              onChange={(e) =>
                                updateTimeSlot(selectedType, index, {
                                  price_per_hour: parseFloat(e.target.value) || 0,
                                })
                              }
                              placeholder="0.00"
                              className="h-9"
                            />
                          </div>
                        </div>
                        <Button
                          onClick={() => removeTimeSlot(selectedType, index)}
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>{t("selectType")}</p>
            </div>
          )}
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={saving || !selectedType}
        className="gap-2 font-semibold"
        style={{
          background: "oklch(0.65 0.20 140)",
          color: "white",
          boxShadow: "0 4px 14px oklch(0.65 0.20 140 / 0.3)",
        }}
      >
        {saving ? t("saving") : t("saveChanges")}
      </Button>
    </div>
  );
}
