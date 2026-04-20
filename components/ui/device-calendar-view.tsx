"use client";

import { useState, useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Calendar, User, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkingHours } from "@/types/hall";

type Reservation = {
  id: string;
  start_time: string;
  end_time: string;
  user_id: string;
  status: string;
  user?: { full_name: string; email: string };
};

type TimeSlot = {
  time: Date;
  reservation: Reservation | null;
};

type Props = {
  deviceId: string;
  deviceName: string;
  hallId: string;
  open: boolean;
  onClose: () => void;
};

export default function DeviceCalendarView({ deviceId, deviceName, hallId, open, onClose }: Props) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !deviceId || !hallId) return;

    const fetchSlots = async () => {
      setLoading(true);
      const supabase = getBrowserClient();

      const { data: hall } = await supabase
        .from("halls")
        .select("working_hours")
        .eq("id", hallId)
        .single();

      if (!hall) {
        setSlots([]);
        setLoading(false);
        return;
      }

      const workingHours = hall?.working_hours as WorkingHours[] | null;
      const dayOfWeek = selectedDate.getDay();
      const daySchedule = workingHours?.find((h) => h.day === dayOfWeek);

      if (!daySchedule || !daySchedule.is_open) {
        setSlots([]);
        setLoading(false);
        return;
      }

      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data: reservations } = await supabase
        .from("reservations")
        .select(`
          id,
          start_time,
          end_time,
          user_id,
          status,
          users:user_id (full_name, email)
        `)
        .eq("device_id", deviceId)
        .gte("start_time", startOfDay.toISOString())
        .lte("end_time", endOfDay.toISOString())
        .in("status", ["pending", "confirmed", "active"]);

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

        const reservation = reservations?.find((r) => {
          const rStart = new Date(r.start_time);
          const rEnd = new Date(r.end_time);
          return slotTime >= rStart && slotTime < rEnd;
        });

        timeSlots.push({
          time: slotTime,
          reservation: reservation
            ? {
                ...reservation,
                user: Array.isArray(reservation.users) ? reservation.users[0] : reservation.users,
              }
            : null,
        });

        current.setMinutes(current.getMinutes() + 30);
      }

      setSlots(timeSlots);
      setLoading(false);
    };

    fetchSlots();
  }, [deviceId, hallId, selectedDate, open]);

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-[98vw] w-full max-h-[96vh] h-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.3)" }}
            >
              <Calendar size={16} style={{ color: "oklch(0.65 0.22 280)" }} />
            </div>
            <div>
              <p className="text-lg font-bold">{deviceName}</p>
              <p className="text-xs text-muted-foreground font-normal">تقويم الحجوزات</p>
            </div>
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3 h-full flex flex-col">
          {/* Date Navigation */}
          <Card className="border-border/60 shrink-0">
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => changeDate(-1)}
                  className="cursor-pointer h-9 w-9 p-0"
                >
                  <ChevronRight size={18} />
                </Button>
                <div className="text-center flex-1">
                  <p className="text-sm font-bold">
                    {selectedDate.toLocaleDateString("ar-SY", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  {isToday && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "oklch(0.55 0.26 280 / 0.15)", color: "oklch(0.65 0.22 280)" }}>
                      اليوم
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => changeDate(1)}
                  className="cursor-pointer h-9 w-9 p-0"
                >
                  <ChevronLeft size={18} />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Time Slots */}
          <div className="flex-1 min-h-0">
          {loading ? (
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-14 gap-2 h-full">
              {Array.from({ length: 42 }).map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : slots.length === 0 ? (
            <Card className="border-border/60 h-full flex items-center justify-center">
              <CardContent className="p-10 text-center">
                <Clock size={32} className="mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-sm font-medium text-muted-foreground">الصالة مغلقة في هذا اليوم</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-14 gap-3 h-full overflow-y-auto pr-1">
              {slots.map((slot, i) => {
                const isPast = slot.time < new Date();
                const isBooked = !!slot.reservation;
                const isPending = slot.reservation?.status === "pending";

                return (
                  <Card
                    key={i}
                    className={cn(
                      "border transition-all hover:shadow-sm",
                      isBooked
                        ? isPending
                          ? "border-yellow-500/50 bg-yellow-500/10"
                          : "border-purple-500/50 bg-purple-500/10"
                        : isPast
                        ? "border-border/30 bg-muted/20"
                        : "border-green-500/50 bg-green-500/10"
                    )}
                  >
                    <CardContent className="p-3 space-y-1.5">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-bold text-center">
                          {slot.time.toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] font-semibold px-2 py-1 rounded-full text-center",
                            isBooked
                              ? isPending
                                ? "bg-yellow-500/30 text-yellow-700 dark:text-yellow-300"
                                : "bg-purple-500/30 text-purple-700 dark:text-purple-300"
                              : isPast
                              ? "bg-muted text-muted-foreground"
                              : "bg-green-500/30 text-green-700 dark:text-green-300"
                          )}
                        >
                          {isBooked ? (isPending ? "انتظار" : "محجوز") : isPast ? "انتهى" : "متاح"}
                        </span>
                      </div>
                      {isBooked && slot.reservation?.user ? (
                        <div className="flex items-start gap-1.5 text-[10px] pt-1.5 border-t border-border/40">
                          <User size={11} className="mt-0.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground truncate leading-tight">
                              {slot.reservation.user.full_name}
                            </p>
                          </div>
                        </div>
                      ) : !isBooked && !isPast ? (
                        <p className="text-[9px] text-muted-foreground text-center pt-1.5 border-t border-border/40">
                          جاهز
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          </div>

          <div className="flex justify-end pt-2 border-t border-border/40 shrink-0">
            <Button variant="outline" onClick={onClose} className="cursor-pointer">
              إغلاق
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
