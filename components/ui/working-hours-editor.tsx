"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock } from "lucide-react";
import type { WorkingHours } from "@/types/hall";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Props = {
  value: WorkingHours[];
  onChange: (hours: WorkingHours[]) => void;
};

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
            <div className="flex items-center gap-2 w-28">
              <input
                type="checkbox"
                checked={dayData.is_open}
                onChange={(e) => updateDay(idx, { is_open: e.target.checked })}
                className="w-4 h-4 rounded border-border"
              />
              <span className="text-sm font-medium">{dayName}</span>
            </div>
            
            {dayData.is_open ? (
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1">
                  <Clock size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                  <Input
                    type="time"
                    value={dayData.open_time}
                    onChange={(e) => updateDay(idx, { open_time: e.target.value })}
                    className="pl-7 h-8 text-xs"
                  />
                </div>
                <span className="text-xs text-muted-foreground">to</span>
                <div className="relative flex-1">
                  <Clock size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                  <Input
                    type="time"
                    value={dayData.close_time}
                    onChange={(e) => updateDay(idx, { close_time: e.target.value })}
                    className="pl-7 h-8 text-xs"
                  />
                </div>
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
