"use client";

import { useState, useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WorkingHours } from "@/types/hall";

type TimeSlot = {
  time: Date;
  available: boolean;
};

type Props = {
  deviceId: string;
  hallId: string;
  selectedDate: Date;
  onSelectSlot: (start: Date | null, end: Date | null) => void;
  pricePerHour?: number;
  locale?: string;
};

export default function CalendarBooking(props: Props) {
  const { deviceId, hallId, selectedDate, onSelectSlot, pricePerHour = 0, locale = "en" } = props;
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [localStart, setLocalStart] = useState<Date | null>(null);
  const [localEnd, setLocalEnd] = useState<Date | null>(null);
  const [, forceUpdate] = useState(0);
  const [currentKey, setCurrentKey] = useState(`${deviceId}-${hallId}-${selectedDate.toISOString()}`);

  useEffect(
    function resetOnChange() {
      const newKey = `${deviceId}-${hallId}-${selectedDate.toISOString()}`;
      if (newKey !== currentKey) {
        setLocalStart(null);
        setLocalEnd(null);
        setCurrentKey(newKey);
      }
    },
    [deviceId, hallId, selectedDate, currentKey]
  );

  useEffect(
    function loadSlots() {
      if (!deviceId || !hallId) return;

      const fetchSlots = async function () {
        setLoading(true);
        const supabase = getBrowserClient();

        const { data: hall, error: hallError } = await supabase
          .from("halls")
          .select("working_hours")
          .eq("id", hallId)
          .single();

        if (hallError || !hall) {
          setSlots([]);
          setLoading(false);
          return;
        }

        const workingHours = hall?.working_hours as WorkingHours[] | null;
        const dayOfWeek = selectedDate.getDay();
        const daySchedule = workingHours?.find(function (h) {
          return h.day === dayOfWeek;
        });

        if (!daySchedule || !daySchedule.is_open) {
          setSlots([]);
          setLoading(false);
          return;
        }

        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        const { data: reservations, error: resError } = await supabase
          .from("reservations")
          .select("start_time, end_time, status")
          .eq("device_id", deviceId)
          .gte("start_time", startOfDay.toISOString())
          .lte("end_time", endOfDay.toISOString())
          .in("status", ["pending", "confirmed", "active"]);

        if (resError) {
          setSlots([]);
          setLoading(false);
          return;
        }

        const timeSlots: TimeSlot[] = [];
        const [openHour, openMin] = daySchedule.open_time.split(":").map(Number);
        const [closeHour, closeMin] = daySchedule.close_time.split(":").map(Number);

        const current = new Date(selectedDate);
        current.setHours(openHour, openMin, 0, 0);
        const end = new Date(selectedDate);
        end.setHours(closeHour, closeMin, 0, 0);
        const now = new Date();

        while (current < end) {
          const slotTime = new Date(current);
          const slotEnd = new Date(current);
          slotEnd.setMinutes(slotEnd.getMinutes() + 30);

          if (slotEnd > end) break;

          const isBooked = reservations?.some(function (r) {
            const rStart = new Date(r.start_time);
            const rEnd = new Date(r.end_time);
            return slotTime < rEnd && rStart < slotEnd;
          });

          const isPast = slotEnd <= now;

          timeSlots.push({
            time: slotTime,
            available: !isBooked && !isPast,
          });

          current.setMinutes(current.getMinutes() + 30);
        }

        setSlots(timeSlots);
        setLoading(false);
      };

      fetchSlots();
    },
    [deviceId, hallId, selectedDate]
  );

  const handleSlotClick = function (slot: TimeSlot) {
    if (!slot.available) return;

    if (!localStart) {
      setLocalStart(slot.time);
      const singleEnd = new Date(slot.time);
      singleEnd.setMinutes(singleEnd.getMinutes() + 30);
      setLocalEnd(singleEnd);
      forceUpdate(n => n + 1);
      onSelectSlot(slot.time, singleEnd);
    } else {
      const clickedTime = slot.time.getTime();
      const startTime = localStart.getTime();

      if (clickedTime === startTime) {
        setLocalStart(null);
        setLocalEnd(null);
        forceUpdate(n => n + 1);
        onSelectSlot(null, null);
        return;
      }

      let rangeStart: Date;
      let rangeEnd: Date;

      if (clickedTime < startTime) {
        rangeStart = slot.time;
        rangeEnd = new Date(localStart);
        rangeEnd.setMinutes(rangeEnd.getMinutes() + 30);
      } else {
        rangeStart = localStart;
        rangeEnd = new Date(slot.time);
        rangeEnd.setMinutes(rangeEnd.getMinutes() + 30);
      }

      const rangeStartTime = rangeStart.getTime();
      const rangeEndTime = rangeEnd.getTime();
      const slotsInRange = slots.filter(function (s) {
        const t = s.time.getTime();
        return t >= rangeStartTime && t < rangeEndTime;
      });

      const allAvailable = slotsInRange.every(function (s) {
        return s.available;
      });

      if (!allAvailable) {
        setLocalStart(slot.time);
        const singleEnd = new Date(slot.time);
        singleEnd.setMinutes(singleEnd.getMinutes() + 30);
        setLocalEnd(singleEnd);
        forceUpdate(n => n + 1);
        onSelectSlot(slot.time, singleEnd);
        return;
      }

      setLocalStart(rangeStart);
      setLocalEnd(rangeEnd);
      forceUpdate(n => n + 1);
      onSelectSlot(rangeStart, rangeEnd);
    }
  };

  if (loading) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-4">
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }).map(function (_, i) {
              return <div key={i} className="h-12 rounded-md bg-muted/50 animate-pulse" />;
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (slots.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">Hall is closed on this day</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 overflow-hidden">
      <CardContent className="p-4">
        {pricePerHour > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/30">
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {locale === "ar" ? "سعر الجلسة (30 دقيقة):" : "Session Price (30 min):"}
              </span>
              <span className="font-bold text-lg" style={{ color: "oklch(0.55 0.26 280)" }}>
                {(pricePerHour / 2).toFixed(2)}
              </span>
              <span className="text-muted-foreground">
                {locale === "ar" ? "ل.س" : "SYP"}
              </span>
            </div>
          </div>
        )}
        <p className="text-sm text-muted-foreground mb-4 text-center leading-relaxed">
          {locale === "ar" 
            ? "اضغط على وقت البداية، ثم اضغط على وقت النهاية (أو اترك جلسة واحدة)"
            : "Click start time, then click end time (or leave as single session)"}
        </p>
        <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2.5">
          {slots.map(function (slot, i) {
            const slotTime = slot.time.getTime();
            
            const isInRange =
              localStart && localEnd && 
              slotTime >= localStart.getTime() && 
              slotTime < localEnd.getTime();

            return (
              <button
                key={i}
                type="button"
                disabled={!slot.available}
                onClick={function () {
                  handleSlotClick(slot);
                }}
                className={cn(
                  "h-14 rounded-lg border-2 transition-all flex flex-col items-center justify-center gap-0.5 overflow-hidden",
                  !slot.available && "opacity-40 cursor-not-allowed bg-muted/30 border-border/50",
                  slot.available && !isInRange && "border-border bg-card hover:border-primary/60 hover:bg-primary/5 cursor-pointer",
                  isInRange && "border-primary bg-primary/15 shadow-md"
                )}
              >
                <span className={cn(
                  "text-sm font-bold",
                  isInRange ? "text-primary" : "text-foreground"
                )}>
                  {slot.time.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </span>
                <span className={cn(
                  "text-[10px] font-medium",
                  !slot.available ? "text-muted-foreground" :
                  isInRange ? "text-primary" : "text-muted-foreground"
                )}>
                  {!slot.available 
                    ? (locale === "ar" ? "انتهى" : "Past")
                    : (locale === "ar" ? "متاح" : "Available")
                  }
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
