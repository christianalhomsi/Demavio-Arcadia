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
  onSelectSlot: (start: Date, end: Date) => void;
};

export default function CalendarBooking(props: Props) {
  const { deviceId, hallId, selectedDate, onSelectSlot } = props;
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [localStart, setLocalStart] = useState<Date | null>(null);
  const [localEnd, setLocalEnd] = useState<Date | null>(null);

  useEffect(
    function resetSelection() {
      setLocalStart(null);
      setLocalEnd(null);
    },
    [selectedDate]
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

          timeSlots.push({
            time: slotTime,
            available: !isBooked,
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
      setLocalEnd(null);
    } else if (!localEnd) {
      const end = new Date(slot.time);
      end.setMinutes(end.getMinutes() + 30);

      if (end <= localStart) {
        setLocalStart(slot.time);
        setLocalEnd(null);
        return;
      }

      const startTime = localStart.getTime();
      const endTime = end.getTime();
      const slotsInRange = slots.filter(function (s) {
        const t = s.time.getTime();
        return t >= startTime && t < endTime;
      });

      const allAvailable = slotsInRange.every(function (s) {
        return s.available;
      });

      if (!allAvailable) {
        setLocalStart(slot.time);
        setLocalEnd(null);
        return;
      }

      setLocalEnd(end);
      onSelectSlot(localStart, end);
    } else {
      setLocalStart(slot.time);
      setLocalEnd(null);
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
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-3">Click start time, then click end time to select range</p>
        <div className="grid grid-cols-4 gap-2">
          {slots.map(function (slot, i) {
            const slotTime = slot.time.getTime();
            const isStart = localStart?.getTime() === slotTime;
            const isInRange =
              localStart && localEnd && slotTime >= localStart.getTime() && slotTime < localEnd.getTime();

            return (
              <Button
                key={i}
                type="button"
                variant="outline"
                disabled={!slot.available}
                onClick={function () {
                  handleSlotClick(slot);
                }}
                className={cn(
                  "h-12 text-xs",
                  isInRange && "border-2 bg-primary/10",
                  isStart && "border-2 bg-primary/20",
                  !slot.available && "opacity-30 cursor-not-allowed"
                )}
                style={isInRange || isStart ? { borderColor: "oklch(0.55 0.26 280)" } : {}}
              >
                {slot.time.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
