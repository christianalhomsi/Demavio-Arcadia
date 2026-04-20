"use client";

import { useState, useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
          .select("start_time, end_time")
          .eq("device_id", deviceId)
          .gte("start_time", startOfDay.toISOString())
          .lte("end_time", endOfDay.toISOString())
          .in("status", ["confirmed", "active"]);

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
      // أول ضغطة: تحديد البداية فقط
      setLocalStart(slot.time);
      const singleEnd = new Date(slot.time);
      singleEnd.setMinutes(singleEnd.getMinutes() + 30);
      setLocalEnd(singleEnd);
      forceUpdate(n => n + 1);
      onSelectSlot(slot.time, singleEnd);
    } else {
      // ضغطة ثانية: تحديد النطاق
      const clickedTime = slot.time.getTime();
      const startTime = localStart.getTime();

      if (clickedTime === startTime) {
        // إذا ضغط على نفس الوقت، إلغاء التحديد
        setLocalStart(null);
        setLocalEnd(null);
        forceUpdate(n => n + 1);
        onSelectSlot(null, null);
        return;
      }

      let rangeStart: Date;
      let rangeEnd: Date;

      if (clickedTime < startTime) {
        // إذا اختار وقت قبل البداية
        rangeStart = slot.time;
        rangeEnd = new Date(localStart);
        rangeEnd.setMinutes(rangeEnd.getMinutes() + 30);
      } else {
        // إذا اختار وقت بعد البداية
        rangeStart = localStart;
        rangeEnd = new Date(slot.time);
        rangeEnd.setMinutes(rangeEnd.getMinutes() + 30);
      }

      // تحقق من أن جميع الجلسات في النطاق متاحة
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
        // إذا كان هناك حجز في النطاق، ابدأ من جديد بالجلسة الجديدة
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
    <Card className="border-border/60">
      <CardContent className="p-3 sm:p-4">
        {pricePerHour > 0 && (
          <div className="mb-3 p-2 rounded-lg bg-primary/5 text-xs text-center">
            <span className="text-muted-foreground">
              {locale === "ar" ? "سعر الجلسة (30 دقيقة):" : "Session Price (30 min):"}
            </span>
            <span className="font-bold mx-1" style={{ color: "oklch(0.55 0.26 280)" }}>
              {(pricePerHour / 2).toFixed(2)}
            </span>
            <span className="text-muted-foreground">
              {locale === "ar" ? "ل.س" : "SYP"}
            </span>
          </div>
        )}
        <p className="text-xs text-muted-foreground mb-3">
          {locale === "ar" 
            ? "اضغط على وقت البداية، ثم اضغط على وقت النهاية (أو اترك جلسة واحدة)"
            : "Click start time, then click end time (or leave as single session)"}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 sm:gap-2">
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
                  "h-10 sm:h-12 text-[10px] sm:text-xs rounded-md border transition-all",
                  !slot.available && "opacity-30 cursor-not-allowed",
                  !isInRange && "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                )}
                style={isInRange ? {
                  borderWidth: '2px',
                  borderColor: 'oklch(0.55 0.26 280)',
                  background: 'oklch(0.55 0.26 280 / 0.15)',
                  color: 'oklch(0.55 0.26 280)',
                  fontWeight: '600'
                } : {}}
              >
                {slot.time.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
