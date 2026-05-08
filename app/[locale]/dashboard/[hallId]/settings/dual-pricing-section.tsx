"use client";

import { useState } from "react";
import { DollarSign, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type DeviceType = {
  id: string;
  name_ar: string;
  name_en: string;
};

type Props = {
  hallId: string;
  locale: string;
  deviceTypes: DeviceType[];
  defaultPricing: Array<{ device_type_id: string; price_per_hour: number }>;
};

// الأجهزة التي تدعم سعرين (ثنائي ورباعي)
const DUAL_PRICING_DEVICES = ['billiards', 'ps4', 'ps5'];

export default function TimePricingSection({
  hallId,
  locale,
  deviceTypes,
  defaultPricing,
}: Props) {
  const [pricing, setPricing] = useState<Record<string, { dual: number; quad: number }>>(() => {
    const initial: Record<string, { dual: number; quad: number }> = {};
    defaultPricing.forEach(p => {
      const device = deviceTypes.find(d => d.id === p.device_type_id);
      if (device) {
        const deviceName = device.name_en.toLowerCase().replace(/\s+/g, '_');
        if (DUAL_PRICING_DEVICES.includes(deviceName)) {
          initial[p.device_type_id] = {
            dual: p.price_per_hour,
            quad: p.price_per_hour
          };
        } else {
          initial[p.device_type_id] = {
            dual: p.price_per_hour,
            quad: p.price_per_hour
          };
        }
      }
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);

  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      ar: {
        devicePricing: "أسعار الأجهزة",
        devicePricingDesc: "حدد سعر الساعة لكل نوع جهاز",
        dualPrice: "سعر ثنائي (لاعبين)",
        quadPrice: "سعر رباعي (4 لاعبين)",
        singlePrice: "السعر/ساعة",
        saveChanges: "حفظ التغييرات",
        saving: "جاري الحفظ...",
        updated: "تم تحديث الأسعار بنجاح",
        updateError: "فشل تحديث الأسعار",
        noDeviceTypes: "لا توجد أنواع أجهزة",
      },
      en: {
        devicePricing: "Device Pricing",
        devicePricingDesc: "Set hourly rates for each device type",
        dualPrice: "Dual Price (2 Players)",
        quadPrice: "Quad Price (4 Players)",
        singlePrice: "Price/Hour",
        saveChanges: "Save Changes",
        saving: "Saving...",
        updated: "Pricing updated successfully",
        updateError: "Failed to update pricing",
        noDeviceTypes: "No device types",
      },
    };
    return translations[locale]?.[key] || key;
  };

  const updatePrice = (typeId: string, mode: 'dual' | 'quad', value: number) => {
    setPricing(prev => ({
      ...prev,
      [typeId]: {
        ...prev[typeId],
        [mode]: Math.max(0, value)
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const prices: Record<string, number> = {};
      
      Object.entries(pricing).forEach(([typeId, prices_obj]) => {
        // استخدام السعر الثنائي كسعر افتراضي
        prices[typeId] = prices_obj.dual;
      });

      const res = await fetch(`/api/dashboard/halls/${hallId}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prices,
          dual_quad_pricing: pricing // حفظ الأسعار الثنائية والرباعية
        }),
      });

      if (!res.ok) throw new Error();
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

        <div className="p-6 space-y-4">
          {deviceTypes.map((device) => {
            const deviceName = device.name_en.toLowerCase().replace(/\s+/g, '_');
            const hasDualPricing = DUAL_PRICING_DEVICES.includes(deviceName);
            const devicePricing = pricing[device.id] || { dual: 0, quad: 0 };

            return (
              <div
                key={device.id}
                className="p-5 rounded-xl border border-border/40 bg-muted/20 space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                    {(locale === "ar" ? device.name_ar : device.name_en).charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      {locale === "ar" ? device.name_ar : device.name_en}
                    </h3>
                    {hasDualPricing && (
                      <p className="text-xs text-muted-foreground">
                        {locale === "ar" ? "يدعم سعرين (ثنائي ورباعي)" : "Supports dual pricing"}
                      </p>
                    )}
                  </div>
                </div>

                {hasDualPricing ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Users size={14} className="text-muted-foreground" />
                        {t("dualPrice")}
                      </Label>
                      <Input
                        type="number"
                        value={devicePricing.dual}
                        onChange={(e) =>
                          updatePrice(device.id, 'dual', parseFloat(e.target.value) || 0)
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
                        value={devicePricing.quad}
                        onChange={(e) =>
                          updatePrice(device.id, 'quad', parseFloat(e.target.value) || 0)
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
                      value={devicePricing.dual}
                      onChange={(e) =>
                        updatePrice(device.id, 'dual', parseFloat(e.target.value) || 0)
                      }
                      placeholder="0.00"
                      className="h-10"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={saving}
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
