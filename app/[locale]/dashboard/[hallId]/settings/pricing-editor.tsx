"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, DollarSign } from "lucide-react";

type HallDevice = {
  id: string;
  device_type_id: string;
  price_per_hour: number;
  device_types: {
    id: string;
    name_ar: string;
    name_en: string;
  };
};

export default function PricingEditor({
  hallId,
  hallDevices,
  locale,
}: {
  hallId: string;
  hallDevices: HallDevice[];
  locale: string;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [prices, setPrices] = useState<Record<string, number>>(
    Object.fromEntries(hallDevices.map((hd) => [hd.id, hd.price_per_hour]))
  );
  const [pending, setPending] = useState(false);

  const updatePrice = (id: string, value: number) => {
    setPrices((prev) => ({ ...prev, [id]: Math.max(0, value) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);

    try {
      const res = await fetch(`/api/dashboard/halls/${hallId}/pricing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : t("updateError"));
        return;
      }

      toast.success(locale === "ar" ? "تم تحديث الأسعار بنجاح!" : "Prices updated successfully!");
      router.refresh();
    } catch {
      toast.error(t("requestFailed"));
    } finally {
      setPending(false);
    }
  };

  if (hallDevices.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-10">
        {locale === "ar" ? "لا توجد أجهزة في هذه الصالة" : "No devices in this hall"}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div
          className="flex items-center gap-3 px-5 py-4 border-b border-border/40"
          style={{ background: "oklch(0.65 0.20 140 / 0.05)" }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "oklch(0.65 0.20 140 / 0.15)",
              border: "1px solid oklch(0.65 0.20 140 / 0.25)",
            }}
          >
            <DollarSign size={15} style={{ color: "oklch(0.65 0.20 140)" }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{t("devicePricing")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("devicePricingDesc")}</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {hallDevices.map((hd) => (
            <div
              key={hd.id}
              className="flex items-center gap-4 p-4 rounded-xl border border-border/40 bg-muted/20"
            >
              <div className="flex-1">
                <p className="font-medium text-sm">
                  {locale === "ar" ? hd.device_types.name_ar : hd.device_types.name_en}
                </p>
              </div>
              <div className="space-y-1 w-32">
                <Label className="text-xs text-muted-foreground">
                  {locale === "ar" ? "السعر/ساعة" : "Price/hour"}
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={prices[hd.id] || 0}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9.]/g, '');
                    updatePrice(hd.id, parseFloat(val) || 0);
                  }}
                  placeholder="0.00"
                  className="w-full"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="gap-2 font-semibold"
        style={{
          background: "oklch(0.65 0.20 140)",
          color: "white",
          boxShadow: "0 4px 14px oklch(0.65 0.20 140 / 0.3)",
        }}
      >
        {pending ? (
          <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        ) : (
          <Save size={15} />
        )}
        {pending ? t("saving") : t("saveChanges")}
      </Button>
    </form>
  );
}
