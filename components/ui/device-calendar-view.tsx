"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { getBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Calendar, User, Clock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { WorkingHours } from "@/types/hall";

type Reservation = {
  id: string;
  start_time: string;
  end_time: string;
  user_id: string;
  guest_name?: string | null;
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
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const [guestName, setGuestName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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
          guest_name,
          status
        `)
        .eq("device_id", deviceId)
        .gte("start_time", startOfDay.toISOString())
        .lt("start_time", endOfDay.toISOString())
        .in("status", ["pending", "confirmed", "active", "completed"]);

      // Fetch user profiles separately
      const userIds = reservations?.map(r => r.user_id).filter(Boolean) || [];
      const uniqueUserIds = [...new Set(userIds)];
      let profiles: any[] = [];
      
      if (uniqueUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, username, email")
          .in("id", uniqueUserIds);
        
        profiles = (profilesData || []).map(p => ({
          id: p.id,
          full_name: p.username || p.email?.split('@')[0] || 'User',
          email: p.email
        }));
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

  const handleAddReservation = async () => {
    if (!selectedSlot || !guestName.trim()) {
      toast.error(tc("error"), { description: "Please fill all fields" });
      return;
    }

    setIsSubmitting(true);
    try {
      const startTime = new Date(selectedSlot);
      const endTime = new Date(selectedSlot);
      endTime.setMinutes(endTime.getMinutes() + 30);

      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hall_id: hallId,
          device_id: deviceId,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          guest_name: guestName.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add reservation");
      }

      toast.success(t("reservationAdded"));
      setShowAddDialog(false);
      setGuestName("");
      setSelectedSlot(null);
      
      // Refresh slots
      const supabase = getBrowserClient();
      const { data: hall } = await supabase
        .from("halls")
        .select("working_hours")
        .eq("id", hallId)
        .single();

      if (hall) {
        const workingHours = hall?.working_hours as WorkingHours[] | null;
        const dayOfWeek = selectedDate.getDay();
        const daySchedule = workingHours?.find((h) => h.day === dayOfWeek);

        if (daySchedule && daySchedule.is_open) {
          const startOfDay = new Date(selectedDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(selectedDate);
          endOfDay.setHours(23, 59, 59, 999);

          const { data: reservations } = await supabase
            .from("reservations")
            .select(`id, start_time, end_time, user_id, guest_name, status`)
            .eq("device_id", deviceId)
            .gte("start_time", startOfDay.toISOString())
            .lt("start_time", endOfDay.toISOString())
            .in("status", ["pending", "confirmed", "active", "completed"]);

          const userIds = reservations?.map(r => r.user_id).filter(Boolean) || [];
          const uniqueUserIds = [...new Set(userIds)];
          let profiles: any[] = [];
          
          if (uniqueUserIds.length > 0) {
            const { data: profilesData } = await supabase
              .from("profiles")
              .select("id, username, email")
              .in("id", uniqueUserIds);
            
            profiles = (profilesData || []).map(p => ({
              id: p.id,
              full_name: p.username || p.email?.split('@')[0] || 'User',
              email: p.email
            }));
          }

          const reservationsWithUsers = reservations?.map(r => ({
            ...r,
            user: profiles?.find(p => p.id === r.user_id)
          }));

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
              return slotTime >= rStart && slotTime < rEnd;
            });

            timeSlots.push({
              time: slotTime,
              reservation: reservation || null,
            });

            current.setMinutes(current.getMinutes() + 30);
          }

          setSlots(timeSlots);
        }
      }
    } catch (error: any) {
      toast.error(tc("error"), { description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="w-full h-full flex flex-col overflow-hidden shadow-2xl border-none rounded-none sm:rounded-3xl">
        <DialogHeader className="border-b border-border/40 px-5 py-4 sm:px-6 shrink-0 bg-background/80 backdrop-blur-md">
          <DialogTitle className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
              style={{ background: "oklch(0.55 0.26 280 / 0.12)", border: "1px solid oklch(0.55 0.26 280 / 0.2)" }}
            >
              <Calendar size={18} style={{ color: "oklch(0.65 0.22 280)" }} />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-base sm:text-lg font-bold tracking-tight leading-none">{deviceName}</span>
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                {t("calendar")}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <DialogBody className="flex-1 overflow-hidden p-0 min-h-0">
          <div className="flex flex-col h-full min-h-0">
            {/* Date Navigation - Fixed at top of body */}
            <div className="px-4 py-3 sm:px-6 sm:py-4 bg-muted/5 border-b border-border/40 shrink-0">
              <div className="flex items-center justify-between gap-4">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => changeDate(-1)}
                  className="rounded-xl h-9 w-9 border-border/60 hover:bg-background hover:text-primary transition-all active:scale-95 shrink-0"
                >
                  <ChevronRight size={18} />
                </Button>
                
                <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                  <span className="text-sm sm:text-base font-bold tabular-nums truncate w-full text-center">
                    {selectedDate.toLocaleDateString("ar-SY", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  {isToday && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {t("today")}
                    </span>
                  )}
                </div>

                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => changeDate(1)}
                  className="rounded-xl h-9 w-9 border-border/60 hover:bg-background hover:text-primary transition-all active:scale-95 shrink-0"
                >
                  <ChevronLeft size={18} />
                </Button>
              </div>
            </div>

            {/* Time Slots - This area should scroll */}
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 overscroll-contain min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="h-24 rounded-2xl bg-muted/50 animate-pulse" />
                  ))}
                </div>
              ) : slots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-muted/5 rounded-3xl border border-dashed border-border/60 my-4">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Clock size={32} className="text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">{t("hallClosed")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-8">
                  {slots.map((slot, i) => {
                    const isPast = slot.time < new Date();
                    const isBooked = !!slot.reservation;
                    const isPending = slot.reservation?.status === "pending";
                    const isActive = slot.reservation?.status === "active";
                    const isCompleted = slot.reservation?.status === "completed";

                    return (
                      <Card
                        key={i}
                        className={cn(
                          "relative overflow-hidden border-none transition-all duration-200 shadow-sm",
                          isBooked
                            ? isPending
                              ? "bg-yellow-500/[0.08] ring-1 ring-yellow-500/20"
                              : isCompleted
                              ? "bg-blue-500/[0.08] ring-1 ring-blue-500/20"
                              : "bg-purple-500/[0.08] ring-1 ring-purple-500/20"
                            : isPast
                            ? "bg-muted/30 ring-1 ring-border/10 opacity-60"
                            : "bg-green-500/[0.08] ring-1 ring-green-500/20"
                        )}
                      >
                        <CardContent className="p-4 flex flex-col min-h-[100px]">
                          <div className="flex justify-between items-start mb-4">
                            <span className="text-base sm:text-lg font-bold tabular-nums tracking-tight">
                              {slot.time.toLocaleTimeString("en-GB", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <div className={cn(
                              "w-2.5 h-2.5 rounded-full",
                              isBooked 
                                ? (isPending ? "bg-yellow-500 animate-pulse" : isCompleted ? "bg-blue-500" : "bg-purple-500") 
                                : (isPast ? "bg-muted-foreground/30" : "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]")
                            )} />
                          </div>

                          <div className="mt-auto space-y-2">
                            <span className={cn(
                              "text-[10px] font-extrabold uppercase tracking-wider block",
                              isBooked
                                ? isPending ? "text-yellow-600" : isCompleted ? "text-blue-600" : "text-purple-600"
                                : isPast ? "text-muted-foreground" : "text-green-600"
                            )}>
                              {isBooked ? (isPending ? t("pending") : (isCompleted ? t("completed") : (isActive ? t("active") : t("booked")))) : isPast ? t("ended") : t("available")}
                            </span>

            {isBooked && slot.reservation?.user?.full_name && (
                              <div className="flex items-center gap-2 pt-2 border-t border-border/10">
                                <User size={10} className="text-muted-foreground shrink-0" />
                                <p className="text-[11px] font-semibold truncate leading-none">
                                  {slot.reservation.user.full_name}
                                </p>
                              </div>
                            )}
                            {isBooked && slot.reservation?.guest_name && (
                              <div className="flex items-center gap-2 pt-2 border-t border-border/10">
                                <User size={10} className="text-muted-foreground shrink-0" />
                                <p className="text-[11px] font-semibold truncate leading-none">
                                  {slot.reservation.guest_name}
                                </p>
                              </div>
                            )}
                            {isBooked && !slot.reservation?.user?.full_name && !slot.reservation?.guest_name && slot.reservation?.user_id && (
                              <div className="flex items-center gap-2 pt-2 border-t border-border/10">
                                <User size={10} className="text-muted-foreground shrink-0" />
                                <p className="text-[11px] font-semibold truncate leading-none text-muted-foreground">
                                  User ID: {slot.reservation.user_id.slice(0, 8)}...
                                </p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
            )}
            </div>

            {/* Footer - Fixed at bottom */}
            <div className="px-5 py-4 border-t border-border/40 bg-background/80 backdrop-blur-md shrink-0 flex justify-between items-center gap-3">
              <Button 
                variant="default" 
                onClick={() => setShowAddDialog(true)}
                className="rounded-xl px-6 font-bold h-10 active:scale-95 transition-transform"
              >
                <Plus size={16} className="ml-2" />
                {t("addReservation")}
              </Button>
              <Button 
                variant="outline" 
                onClick={onClose} 
                className="rounded-xl px-8 font-bold h-10 border-border/60 active:scale-95 transition-transform"
              >
                {tc("close")}
              </Button>
            </div>
          </div>
        </DialogBody>
      </DialogContent>

      {/* Add Reservation Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent onClose={() => setShowAddDialog(false)} className="w-[95vw] max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader className="border-b border-border/40 px-5 py-4 shrink-0">
            <DialogTitle className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                style={{ background: "oklch(0.55 0.26 280 / 0.12)", border: "1px solid oklch(0.55 0.26 280 / 0.2)" }}
              >
                <Plus size={18} style={{ color: "oklch(0.65 0.22 280)" }} />
              </div>
              <span className="text-base sm:text-lg font-bold tracking-tight">{t("addReservation")}</span>
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-0">
            <div className="space-y-2">
              <Label htmlFor="guestName" className="text-sm font-semibold">{t("guestName")}</Label>
              <Input
                id="guestName"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder={t("guestNamePlaceholder")}
                disabled={isSubmitting}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-3">
              <Label className="text-sm font-semibold">{t("selectTime")}</Label>
              {slots.filter(slot => !slot.reservation && slot.time >= new Date()).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {t("noAvailableSlots") || "لا توجد أوقات متاحة"}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-[40vh] overflow-y-auto p-1 rounded-xl bg-muted/20">
                  {slots
                    .filter(slot => !slot.reservation && slot.time >= new Date())
                    .map((slot, i) => (
                      <Button
                        key={i}
                        variant={selectedSlot?.getTime() === slot.time.getTime() ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedSlot(slot.time)}
                        disabled={isSubmitting}
                        className={cn(
                          "h-11 text-sm font-bold rounded-xl transition-all",
                          selectedSlot?.getTime() === slot.time.getTime() 
                            ? "shadow-md scale-105" 
                            : "hover:scale-105"
                        )}
                      >
                        {slot.time.toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Button>
                    ))}
                </div>
              )}
            </div>
          </DialogBody>
          <div className="border-t border-border/40 px-5 py-4 shrink-0 flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                setGuestName("");
                setSelectedSlot(null);
              }}
              disabled={isSubmitting}
              className="flex-1 h-11 rounded-xl font-bold"
            >
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleAddReservation}
              disabled={isSubmitting || !guestName.trim() || !selectedSlot}
              className="flex-1 h-11 rounded-xl font-bold"
            >
              {isSubmitting ? t("adding") : tc("confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
