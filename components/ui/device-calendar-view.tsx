"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("devices");
  const tc = useTranslations("common");

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

      const { data: reservations, error: reservationsError } = await supabase
        .from("reservations")
        .select(`
          id,
          start_time,
          end_time,
          user_id,
          status
        `)
        .eq("device_id", deviceId)
        .gte("start_time", startOfDay.toISOString())
        .lt("start_time", endOfDay.toISOString())
        .in("status", ["pending", "confirmed", "active"]);

      // Fetch user profiles separately
      const userIds = reservations?.map(r => r.user_id).filter(Boolean) || [];
      const uniqueUserIds = [...new Set(userIds)];
      let profiles: any[] = [];
      
      if (uniqueUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", uniqueUserIds);
        profiles = profilesData || [];
      }

      // Map profiles to reservations
      const reservationsWithUsers = reservations?.map(r => ({
        ...r,
        user: profiles?.find(p => p.id === r.user_id)
      }));

      console.log('Reservations:', reservationsWithUsers);
      console.log('Profiles:', profiles);

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

        const reservation = reservationsWithUsers?.find((r) => {
          const rStart = new Date(r.start_time);
          const rEnd = new Date(r.end_time);
          const overlaps = slotTime >= rStart && slotTime < rEnd;
          if (overlaps) {
            console.log('Found reservation for slot:', slotTime, 'Reservation:', r);
          }
          return overlaps;
        });

        timeSlots.push({
          time: slotTime,
          reservation: reservation || null,
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
      <DialogContent onClose={onClose} className="max-w-[100vw] sm:max-w-[95vw] md:max-w-[90vw] lg:max-w-7xl w-full h-[100dvh] sm:h-auto sm:max-h-[96vh] m-0 sm:m-auto rounded-none sm:rounded-2xl flex flex-col">
        <DialogHeader className="border-b pb-2 sm:pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <div
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.3)" }}
            >
              <Calendar size={14} className="sm:w-4 sm:h-4" style={{ color: "oklch(0.65 0.22 280)" }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm sm:text-base md:text-lg font-bold truncate">{deviceName}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-normal">{t("calendar")}</p>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <DialogBody className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex flex-col gap-2 sm:gap-3 h-full">
            {/* Date Navigation */}
            <Card className="border-border/60 shrink-0">
              <CardContent className="p-2 sm:p-3">
                <div className="flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => changeDate(-1)}
                    className="cursor-pointer h-8 w-8 sm:h-9 sm:w-9 p-0 shrink-0"
                  >
                    <ChevronRight size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </Button>
                  <div className="text-center flex-1 min-w-0">
                    <p className="text-[11px] sm:text-xs md:text-sm font-bold truncate">
                      {selectedDate.toLocaleDateString("ar-SY", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    {isToday && (
                      <span className="inline-block mt-1 text-[9px] sm:text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: "oklch(0.55 0.26 280 / 0.15)", color: "oklch(0.65 0.22 280)" }}>
                        {t("today")}
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => changeDate(1)}
                    className="cursor-pointer h-8 w-8 sm:h-9 sm:w-9 p-0 shrink-0"
                  >
                    <ChevronLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Time Slots */}
            {loading ? (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pb-2">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div key={i} className="h-24 sm:h-28 rounded-lg bg-muted/50 animate-pulse" />
                  ))}
                </div>
              </div>
            ) : slots.length === 0 ? (
              <Card className="border-border/60 flex-1 flex items-center justify-center min-h-0">
                <CardContent className="p-6 sm:p-10 text-center">
                  <Clock size={28} className="sm:w-8 sm:h-8 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">{t("hallClosed")}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pb-2">
                {slots.map((slot, i) => {
                  const isPast = slot.time < new Date();
                  const isBooked = !!slot.reservation;
                  const isPending = slot.reservation?.status === "pending";
                  const isConfirmed = slot.reservation?.status === "confirmed";
                  const isActive = slot.reservation?.status === "active";

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
                      <CardContent className="p-2.5 sm:p-4 space-y-1.5">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm sm:text-base font-bold text-center">
                            {slot.time.toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] sm:text-xs font-semibold px-2 py-1 rounded-full text-center",
                              isBooked
                                ? isPending
                                  ? "bg-yellow-500/30 text-yellow-700 dark:text-yellow-300"
                                  : "bg-purple-500/30 text-purple-700 dark:text-purple-300"
                                : isPast
                                ? "bg-muted text-muted-foreground"
                                : "bg-green-500/30 text-green-700 dark:text-green-300"
                            )}
                          >
                            {isBooked ? (isPending ? t("pending") : (isActive ? t("active") : t("booked"))) : isPast ? t("ended") : t("available")}
                          </span>
                        </div>
                        {isBooked && slot.reservation?.user ? (
                          <div className="flex items-start gap-1.5 text-[10px] sm:text-xs pt-1.5 border-t border-border/40">
                            <User size={11} className="sm:w-[13px] sm:h-[13px] mt-0.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-foreground truncate leading-tight">
                                {slot.reservation.user.full_name}
                              </p>
                            </div>
                          </div>
                        ) : !isBooked && !isPast ? (
                          <p className="text-[10px] sm:text-xs text-muted-foreground text-center pt-1.5 border-t border-border/40">
                            {t("ready")}
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-border/40 shrink-0">
              <Button variant="outline" onClick={onClose} className="cursor-pointer text-xs sm:text-sm h-8 sm:h-9 px-3 sm:px-4">
                {tc("close")}
              </Button>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
