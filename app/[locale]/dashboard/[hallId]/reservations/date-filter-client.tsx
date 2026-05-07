"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Filter } from "lucide-react";

export default function DateFilterClient({ hallId, initialDate }: { hallId: string; initialDate: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("dashboard");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(initialDate));

  const handleDateChange = (date: Date) => {
    setSelectedDate(date);
    const dateStr = date.toISOString().split('T')[0];
    router.push(`${pathname}?date=${dateStr}`);
  };

  const handleToday = () => {
    const today = new Date();
    setSelectedDate(today);
    const dateStr = today.toISOString().split('T')[0];
    router.push(`${pathname}?date=${dateStr}`);
  };

  return (
    <Card className="p-5 border-border/60 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
            style={{ 
              background: "linear-gradient(135deg, oklch(0.55 0.26 280 / 0.15), oklch(0.55 0.26 280 / 0.08))", 
              border: "1px solid oklch(0.55 0.26 280 / 0.3)",
              boxShadow: "0 0 20px oklch(0.55 0.26 280 / 0.15)"
            }}
          >
            <Filter size={18} style={{ color: "oklch(0.65 0.22 280)" }} />
          </div>
          <div>
            <h3 className="text-sm font-bold leading-none">{t("filter")}</h3>
            <p className="text-xs text-muted-foreground mt-1">{t("selectDate")}</p>
          </div>
        </div>
        
        <div className="flex-1 flex items-center gap-3">
          <DatePicker
            value={selectedDate}
            onChange={handleDateChange}
            className="flex-1 max-w-xs"
          />
          <Button
            variant="outline"
            onClick={handleToday}
            className="h-11 px-5 rounded-xl font-semibold border-border/60 hover:bg-primary/10 hover:border-primary/50 hover:text-primary transition-all duration-200 whitespace-nowrap"
          >
            {t("today")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
