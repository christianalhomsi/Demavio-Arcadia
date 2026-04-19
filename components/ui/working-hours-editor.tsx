"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock } from "lucide-react";
import type { WorkingHours } from "@/types/hall";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

type Props = {
  value: WorkingHours[];
  onChange: (hours: WorkingHours[]) => void;
};

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? value)}>
      <SelectTrigger className="flex-1 h-8 text-xs gap-1.5">
        <Clock size={11} className="text-muted-foreground/50 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TIMES.map(t => (
          <SelectItem key={t} value={t}>{t}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function WorkingHoursEditor({ value, onChange }: Props) {
  const getDay = (day: number) => value.find(h => h.day === day) || { day, open_time: "09:00", close_time: "23:00", is_open: true };

  const updateDay = (day: number, updates: Partial<WorkingHours>) => {
    const existing = value.find(h => h.day === day);
    if (existing) {
      onChange(value.map(h => h.day === day ? { ...h, ...updates } : h));
    } else {
      onChange([...value, { day, open_time: "09:00", close_time: "23:00", is_open: true, ...updates }]);
    }
  };

  return (
    <div className="space-y-3">
      {DAYS.map((dayName, idx) => {
        const dayData = getDay(idx);
        return (
          <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-muted/20">
            <div className="flex items-center gap-2 w-28 shrink-0">
              <button
                type="button"
                role="checkbox"
                aria-checked={dayData.is_open}
                onClick={() => updateDay(idx, { is_open: !dayData.is_open })}
                className={`w-4 h-4 rounded shrink-0 border transition-colors ${
                  dayData.is_open
                    ? "border-transparent"
                    : "border-border bg-transparent"
                }`}
                style={dayData.is_open ? { background: "oklch(0.55 0.26 280)", boxShadow: "0 0 0 1px oklch(0.55 0.26 280)" } : {}}
              >
                {dayData.is_open && (
                  <svg viewBox="0 0 10 10" className="w-full h-full p-0.5" fill="none">
                    <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <span className="text-sm font-medium">{dayName}</span>
            </div>

            {dayData.is_open ? (
              <div className="flex items-center gap-2 flex-1">
                <TimeSelect value={dayData.open_time} onChange={v => updateDay(idx, { open_time: v })} />
                <span className="text-xs text-muted-foreground shrink-0">to</span>
                <TimeSelect value={dayData.close_time} onChange={v => updateDay(idx, { close_time: v })} />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic">Closed</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
