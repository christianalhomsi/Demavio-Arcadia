"use client";

import { useState } from "react";
import { Clock, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkingHours } from "@/types/hall";
import { toast } from "sonner";

type Props = {
  hallId: string;
  initialHours: WorkingHours[];
  locale: string;
};

const DAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function WorkingHoursSection({ hallId, initialHours, locale }: Props) {
  const [hours, setHours] = useState<WorkingHours[]>(initialHours);
  const [saving, setSaving] = useState(false);

  const DAYS = locale === "ar" ? DAYS_AR : DAYS_EN;

  const t = (key: string) => {
    const translations: Record<string, Record<string, string>> = {
      ar: {
        workingHours: "ساعات العمل",
        workingHoursDesc: "تحديد أوقات الدوام لكل يوم",
        open: "فتح",
        close: "إغلاق",
        closed: "مغلق",
        saveChanges: "حفظ التغييرات",
        saving: "جاري الحفظ...",
        updated: "تم تحديث أوقات الدوام بنجاح",
        updateError: "فشل تحديث أوقات الدوام",
      },
      en: {
        workingHours: "Working Hours",
        workingHoursDesc: "Set operating hours for each day",
        open: "Open",
        close: "Close",
        closed: "Closed",
        saveChanges: "Save Changes",
        saving: "Saving...",
        updated: "Working hours updated successfully",
        updateError: "Failed to update working hours",
      },
    };
    return translations[locale]?.[key] || key;
  };

  const getDay = (day: number) =>
    hours.find((h) => h.day === day) || {
      day,
      open_time: "09:00",
      close_time: "23:00",
      is_open: true,
    };

  const updateDay = (day: number, updates: Partial<WorkingHours>) => {
    const existing = hours.find((h) => h.day === day);
    if (existing) {
      setHours(hours.map((h) => (h.day === day ? { ...h, ...updates } : h)));
    } else {
      setHours([
        ...hours,
        { day, open_time: "09:00", close_time: "23:00", is_open: true, ...updates },
      ]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/halls/${hallId}/working-hours`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ working_hours: hours }),
      });

      if (!res.ok) throw new Error();
      toast.success(t("updated"));
    } catch {
      toast.error(t("updateError"));
    } finally {
      setSaving(false);
    }
  };

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
            <Clock size={18} style={{ color: "oklch(0.65 0.20 140)" }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t("workingHours")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("workingHoursDesc")}</p>
          </div>
        </div>

        <div className="p-6 space-y-3">
          {DAYS.map((dayName, idx) => {
            const dayData = getDay(idx);
            return (
              <div
                key={idx}
                className="flex items-center gap-4 p-4 rounded-xl border border-border/40 bg-muted/20"
              >
                <button
                  type="button"
                  onClick={() => updateDay(idx, { is_open: !dayData.is_open })}
                  className={`w-6 h-6 rounded-lg shrink-0 border-2 transition-all flex items-center justify-center ${
                    dayData.is_open
                      ? "border-transparent"
                      : "border-border bg-transparent"
                  }`}
                  style={
                    dayData.is_open
                      ? {
                          background: "oklch(0.65 0.20 140)",
                          boxShadow: "0 2px 8px oklch(0.65 0.20 140 / 0.3)",
                        }
                      : {}
                  }
                >
                  {dayData.is_open && <Check size={14} className="text-white" />}
                </button>

                <div className="w-28 shrink-0">
                  <span className="text-sm font-semibold">{dayName}</span>
                </div>

                {dayData.is_open ? (
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-10">{t("open")}</span>
                      <Input
                        type="time"
                        value={dayData.open_time}
                        onChange={(e) => updateDay(idx, { open_time: e.target.value })}
                        className="w-32 h-9"
                      />
                    </div>
                    <span className="text-muted-foreground">—</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-10">{t("close")}</span>
                      <Input
                        type="time"
                        value={dayData.close_time}
                        onChange={(e) => updateDay(idx, { close_time: e.target.value })}
                        className="w-32 h-9"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <X size={14} />
                    <span className="text-sm italic">{t("closed")}</span>
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
