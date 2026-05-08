"use client";

import { useState } from "react";
import { DollarSign, Users, Clock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type DeviceType = {
  id: string;
  name_ar: string;
  name_en: string;
};

type TimeSlot = {
  start_time: string;
  end_time: string;
  price_dual: number;
  price_quad: number;
};

type Props = {
  hallId: string;
  locale: string;
  deviceTypes: DeviceType[];
  defaultPricing: Array<{ device_type_id: string; price_per_hour: number }>;
};

// الأجهزة التي تدعم سعرين (ثنائي ورباعي)
const DUAL_PRICING_DEVICES = ['billiards', 'playstation_4', 'playstation_5', 'ps4', 'ps5'];

export default function ComprehensivePricingSection({
  hallId,
  locale,
  deviceTypes,
  defaultPricing,
}: Props) {
  const [selectedType, setSelectedType] = useState<string>("");
  
  // الأسعار الافتراضية (بدون وقت محدد)
  const [defaultPrices, setDefaultPrices] = useState<Record<string, { dual: number; quad: number }>>(() => {
    const initial: Record<string, { dual: number; quad: number }> = {};
    defaultPricing.forEach(p => {
      initial[p.device_type_id] = {
        dual: p.price_per_hour,
        quad: p.price_per_hour
      };
    });
    return initial;
  });

  // الأسعار حسب الوقت
  const [timeSlots, setTimeSlots] = useState<Record<string, TimeSlot[]>>({});
  
  const [saving, setSaving] = useState(false);

  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      ar: {
        devicePricing: "أسعار الأجهزة",
        devicePricingDesc: "حدد الأسعار الافتراضية والأسعار حسب الوقت",
        selectDeviceType: "اختر نوع الجهاز",
        defaultPricing: "الأسعار الافتراضية",
        timePricing: "الأسعار حسب الوقت",
        dualPrice: "سعر ثنائي (لاعبين)",
        quadPrice: "سعر رباعي (4 لاعبين)",
        singlePrice: "السعر/ساعة",
        addTimeSlot: "إضافة فترة زمنية",
        from: "من",
        to: "إلى",
        saveChanges: "حفظ التغييرات",
        saving: "جاري الحفظ...",
        updated: "تم تحديث الأسعار بنجاح",
        updateError: "فشل تحديث الأسعار",
        noDeviceTypes: "لا توجد أنواع أجهزة",
        selectType: "اختر نوع جهاز لتعديل أسعاره",
        noTimeSlots: "لا توجد فترات زمنية محددة",
        addFirstSlot: "أضف فترة زمنية لتحديد أسعار مختلفة حسب الوقت",
        defaultPricingDesc: "الأسعار المستخدمة عندما لا يوجد سعر محدد حسب الوقت",
        timePricingDesc: "أضف أسعار مختلفة لأوقات مختلفة من اليوم (مثال: 9ص-5م سعر، 5م-12م سعر آخر)",
      },
      en: {
        devicePricing: "Device Pricing",
        devicePricingDesc: "Set default prices and time-based pricing",
        selectDeviceType: "Select Device Type",
        defaultPricing: "Default Pricing",
        timePricing: "Time-Based Pricing",
        dualPrice: "Dual Price (2 Players)",
        quadPrice: "Quad Price (4 Players)",
        singlePrice: "Price/Hour",
        addTimeSlot: "Add Time Slot",
        from: "From",
        to: "To",
        saveChanges: "Save Changes",
        saving: "Saving...",
        updated: "Pricing updated successfully",
        updateError: "Failed to update pricing",
        noDeviceTypes: "No device types",
        selectType: "Select a device type to edit its pricing",
        noTimeSlots: "No time slots defined",
        addFirstSlot: "Add a time slot to set different prices by time",
        defaultPricingDesc: "Prices used when no time-based pricing is set",
        timePricingDesc: "Add different prices for different times of day (e.g., 9am-5pm one price, 5pm-12am another)",
      },
    };
    return translations[locale]?.[key] || key;
  };

  const hasDualPricing = (device: DeviceType) => {
    const deviceName = device.name_en.toLowerCase().replace(/\s+/g, '_');
    return DUAL_PRICING_DEVICES.includes(deviceName);
  };

  const updateDefaultPrice = (typeId: string, mode: 'dual' | 'quad', value: number) => {
    setDefaultPrices(prev => ({
      ...prev,
      [typeId]: {
        ...prev[typeId],
        [mode]: Math.max(0, value)
      }
    }));
  };

  const addTimeSlot = () => {
    if (!selectedType) return;
    const device = deviceTypes.find(d => d.id === selectedType);
    const isDual = device && hasDualPricing(device);
    const defaultPrice = defaultPrices[selectedType]?.dual || 10;
    
    const newSlot: TimeSlot = {
      start_time: "09:00",
      end_time: "17:00",
      price_dual: defaultPrice,
      price_quad: defaultPrice,
    };
    
    setTimeSlots(prev => ({
      ...prev,
      [selectedType]: [...(prev[selectedType] || []), newSlot]
    }));
  };

  const removeTimeSlot = (typeId: string, index: number) => {
    setTimeSlots(prev => ({
      ...prev,
      [typeId]: prev[typeId].filter((_, i) => i !== index)
    }));
  };

  const updateTimeSlot = (typeId: string, index: number, updates: Partial<TimeSlot>) => {
    setTimeSlots(prev => ({
      ...prev,
      [typeId]: prev[typeId].map((slot, i) => (i === index ? { ...slot, ...updates } : slot))
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // حفظ الأسعار الافتراضية
      const prices: Record<string, number> = {};
      Object.entries(defaultPrices).forEach(([typeId, prices_obj]) => {
        prices[typeId] = prices_obj.dual;
      });

      const defaultRes = await fetch(`/api/dashboard/halls/${hallId}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prices,
          dual_quad_pricing: defaultPrices
        }),
      });

      // حفظ الأسعار حسب الوقت
      const timeRes = await fetch(`/api/halls/${hallId}/time-pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          pricing: timeSlots,
          dual_quad_pricing: true
        }),
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

  const selectedDevice = deviceTypes.find(d => d.id === selectedType);
  const isDualDevice = selectedDevice && hasDualPricing(selectedDevice);

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
                <SelectValue>
                  {selectedType && selectedDevice
                    ? (locale === "ar" ? selectedDevice.name_ar : selectedDevice.name_en)
                    : t("selectDeviceType")}
                </SelectValue>
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
              {/* عرض اسم الجهاز المختار */}
              <div className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-gradient-to-r from-purple-500/10 to-pink-500/10">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  {(locale === "ar" ? selectedDevice?.name_ar : selectedDevice?.name_en)?.charAt(0) || "?"}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    {locale === "ar" ? "الجهاز المختار" : "Selected Device"}
                  </p>
                  <h3 className="text-lg font-bold">
                    {locale === "ar" ? selectedDevice?.name_ar : selectedDevice?.name_en}
                  </h3>
                  {isDualDevice && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {locale === "ar" ? "يدعم سعرين (ثنائي ورباعي)" : "Supports dual pricing (2 & 4 players)"}
                    </p>
                  )}
                </div>
              </div>

              <Tabs defaultValue="default" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="default">{t("defaultPricing")}</TabsTrigger>
                <TabsTrigger value="time">{t("timePricing")}</TabsTrigger>
              </TabsList>

              {/* الأسعار الافتراضية */}
              <TabsContent value="default" className="space-y-4 mt-4">
                <p className="text-xs text-muted-foreground">{t("defaultPricingDesc")}</p>
                
                <div className="p-5 rounded-xl border border-border/40 bg-muted/20 space-y-4">
                  {isDualDevice ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <Users size={14} className="text-muted-foreground" />
                          {t("dualPrice")}
                        </Label>
                        <Input
                          type="number"
                          value={defaultPrices[selectedType]?.dual || 0}
                          onChange={(e) =>
                            updateDefaultPrice(selectedType, 'dual', parseFloat(e.target.value) || 0)
                          }
                          placeholder="0.00"
                          className="h-10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium flex items-center gap-2">
                          <Users size={14} className="text-muted-foreground" />
                          {t("quadPrice")}
                        </Label>
                        <Input
                          type="number"
                          value={defaultPrices[selectedType]?.quad || 0}
                          onChange={(e) =>
                            updateDefaultPrice(selectedType, 'quad', parseFloat(e.target.value) || 0)
                          }
                          placeholder="0.00"
                          className="h-10"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{t("singlePrice")}</Label>
                      <Input
                        type="number"
                        value={defaultPrices[selectedType]?.dual || 0}
                        onChange={(e) =>
                          updateDefaultPrice(selectedType, 'dual', parseFloat(e.target.value) || 0)
                        }
                        placeholder="0.00"
                        className="h-10"
                      />
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* الأسعار حسب الوقت */}
              <TabsContent value="time" className="space-y-4 mt-4">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-xs text-muted-foreground flex-1">{t("timePricingDesc")}</p>
                  <Button
                    onClick={addTimeSlot}
                    size="sm"
                    className="gap-2 shrink-0"
                    style={{
                      background: "oklch(0.65 0.20 140)",
                      color: "white",
                    }}
                  >
                    <Plus size={16} />
                    {t("addTimeSlot")}
                  </Button>
                </div>

                {!timeSlots[selectedType] || timeSlots[selectedType].length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm border-2 border-dashed border-border/60 rounded-xl">
                    <Clock size={32} className="mx-auto mb-3 opacity-50" />
                    <p>{t("noTimeSlots")}</p>
                    <p className="text-xs mt-1">{t("addFirstSlot")}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {timeSlots[selectedType].map((slot, index) => (
                      <div
                        key={index}
                        className="p-4 rounded-xl border border-border/40 bg-muted/20 space-y-3"
                      >
                        <div className="grid grid-cols-2 gap-3">
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
                        </div>

                        {isDualDevice ? (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Users size={12} />
                                {t("dualPrice")}
                              </Label>
                              <Input
                                type="number"
                                value={slot.price_dual}
                                onChange={(e) =>
                                  updateTimeSlot(selectedType, index, {
                                    price_dual: parseFloat(e.target.value) || 0,
                                  })
                                }
                                placeholder="0.00"
                                className="h-9"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                <Users size={12} />
                                {t("quadPrice")}
                              </Label>
                              <Input
                                type="number"
                                value={slot.price_quad}
                                onChange={(e) =>
                                  updateTimeSlot(selectedType, index, {
                                    price_quad: parseFloat(e.target.value) || 0,
                                  })
                                }
                                placeholder="0.00"
                                className="h-9"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t("singlePrice")}</Label>
                            <Input
                              type="number"
                              value={slot.price_dual}
                              onChange={(e) =>
                                updateTimeSlot(selectedType, index, {
                                  price_dual: parseFloat(e.target.value) || 0,
                                })
                              }
                              placeholder="0.00"
                              className="h-9"
                            />
                          </div>
                        )}

                        <Button
                          onClick={() => removeTimeSlot(selectedType, index)}
                          variant="ghost"
                          size="sm"
                          className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 size={14} className="mr-2" />
                          {locale === "ar" ? "حذف الفترة" : "Remove Slot"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign size={32} className="mx-auto mb-3 opacity-50" />
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
