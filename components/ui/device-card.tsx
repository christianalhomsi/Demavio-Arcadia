"use client";

import { useState, useEffect } from "react";
import type { Device, DeviceStatus } from "@/services/devices";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Monitor, CheckCircle2, Timer, Clock, WifiOff, CalendarPlus } from "lucide-react";
import CalendarBooking from "@/components/ui/calendar-booking";
import { getBrowserClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";

const STATUS: Record<DeviceStatus, { cls: string; label: Record<string, string>; icon: React.ElementType }> = {
  available: { cls: "badge-available", label: { en: "Available", ar: "متاح" },    icon: CheckCircle2 },
  active:    { cls: "badge-active",    label: { en: "Active",    ar: "نشط" },      icon: Timer },
  offline:   { cls: "badge-offline",   label: { en: "Offline",   ar: "غير متصل" }, icon: WifiOff },
  idle:      { cls: "badge-idle",      label: { en: "Reserved",  ar: "محجوز" },    icon: Clock },
  paused:    { cls: "badge-paused",    label: { en: "Paused",    ar: "موقوف" },    icon: Timer },
};

export default function DeviceCard({ device, hallId }: { device: Device; hallId: string }) {
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const [open, setOpen] = useState(false);
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [loading, setLoading] = useState(false);
  const [booked, setBooked] = useState(false);
  const [pricePerHour, setPricePerHour] = useState<number>(0);

  // جلب السعر عند فتح الـ dialog
  useEffect(() => {
    if (!open || !device.device_type_id) return;
    let cancelled = false;
    const supabase = getBrowserClient();
    (async () => {
      try {
        const { data, error } = await supabase
          .from("hall_devices")
          .select("price_per_hour")
          .eq("hall_id", hallId)
          .eq("device_type_id", device.device_type_id)
          .single();
        
        if (cancelled) return;
        if (error) {
          console.error("[DeviceCard] price fetch error:", error.message);
          setPricePerHour(0);
          return;
        }
        if (data) setPricePerHour(data.price_per_hour || 0);
      } catch (err) {
        if (!cancelled) {
          console.error("[DeviceCard] price fetch exception:", err);
          setPricePerHour(0);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, hallId, device.device_type_id]);

  async function handleBook() {
    if (!selectedSlot) {
      toast.error(locale === "ar" ? "يرجى اختيار وقت الحجز" : "Please select a time slot");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        hall_id: hallId, 
        device_id: device.id, 
        start_time: selectedSlot.start.toISOString(), 
        end_time: selectedSlot.end.toISOString() 
      }),
    });
    setLoading(false);
    if (res.ok) {
      setBooked(true);
      setOpen(false);
      setSelectedSlot(null);
      toast.success(locale === "ar" ? "تم حجز الجهاز بنجاح!" : "Device booked successfully!");
    } else {
      const json = await res.json().catch(() => ({}));
      const msg = json?.error ?? "Booking failed.";
      if (msg === "OVERLAP") {
        toast.error(locale === "ar" ? "الوقت محجوز مسبقاً. اختر وقت آخر." : "Time slot already taken. Choose another time.");
      } else {
        toast.error(msg);
      }
    }
  }

  const s = STATUS[device.status] ?? STATUS.offline;
  const StatusIcon = s.icon;
  const canBook = device.status === "available" && !booked;

  return (
    <Card className="border-border/60 hover:border-border transition-colors">
      <CardContent className="pt-3 sm:pt-4 space-y-2.5 sm:space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <Monitor size={14} className="sm:w-[15px] sm:h-[15px] text-muted-foreground shrink-0" />
            <p className="text-xs sm:text-sm font-semibold text-foreground truncate">{device.name}</p>
          </div>
          <span className={`flex items-center gap-1 text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded-full shrink-0 ${booked ? "badge-idle" : s.cls}`}>
            <StatusIcon size={10} className="sm:w-[11px] sm:h-[11px]" />
            <span className="hidden xs:inline">{booked ? (locale === "ar" ? "محجوز" : "Reserved") : (s.label[locale] ?? s.label["en"])}</span>
          </span>
        </div>

        {canBook && !open && (
          <Button
            size="sm"
            className="w-full text-[10px] sm:text-xs cursor-pointer gap-1 sm:gap-1.5 h-7 sm:h-8"
            style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
            onClick={() => setOpen(true)}
          >
            <CalendarPlus size={12} className="sm:w-[13px] sm:h-[13px]" />
            {locale === "ar" ? "احجز هذا الجهاز" : "Book this device"}
          </Button>
        )}

        {device.status === "paused" && (
          <div className="p-2 sm:p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-center">
            <p className="text-[10px] sm:text-xs font-medium text-orange-400">
              {locale === "ar" ? "الجهاز قيد الصيانة" : "Device under maintenance"}
            </p>
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent onClose={() => setOpen(false)}>
            <DialogHeader>
              <DialogTitle className="text-sm sm:text-base">
                {locale === "ar" ? `حجز ${device.name}` : `Book ${device.name}`}
              </DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-3 sm:space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] sm:text-xs text-muted-foreground">
                  {locale === "ar" ? "تاريخ الحجز" : "Booking Date"}
                </Label>
                <Input 
                  type="date" 
                  value={bookingDate}
                  onChange={(e) => {
                    setBookingDate(e.target.value);
                    setSelectedSlot(null);
                  }} 
                  className="h-8 sm:h-9 text-xs sm:text-sm" 
                />
              </div>
              {bookingDate && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] sm:text-xs text-muted-foreground">
                    {locale === "ar" ? "اختر وقت الحجز" : "Select Time Slot"}
                  </Label>
                  <CalendarBooking
                    key={`${device.id}-${bookingDate}`}
                    deviceId={device.id}
                    hallId={hallId}
                    selectedDate={new Date(bookingDate)}
                    onSelectSlot={(start, end) => {
                      if (start && end) setSelectedSlot({ start, end });
                      else setSelectedSlot(null);
                    }}
                    pricePerHour={pricePerHour}
                    locale={locale}
                  />
                </div>
              )}
              {selectedSlot && (
                <div className="p-2.5 sm:p-3 rounded-lg bg-muted/50 space-y-1.5 sm:space-y-2">
                  <div className="text-xs sm:text-sm">
                    <span className="text-muted-foreground">
                      {locale === "ar" ? "المختار: " : "Selected: "}
                    </span>
                    <span className="font-medium">
                      {selectedSlot.start.toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                      {" - "}
                      {selectedSlot.end.toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </span>
                  </div>
                  {pricePerHour > 0 && (
                    <div className="flex items-center justify-between pt-1.5 sm:pt-2 border-t border-border/40">
                      <span className="text-xs sm:text-sm text-muted-foreground">
                        {locale === "ar" ? "السعر الإجمالي:" : "Total Price:"}
                      </span>
                      <span className="text-base sm:text-lg font-bold" style={{ color: "oklch(0.55 0.26 280)" }}>
                        {(() => {
                          const durationMs = selectedSlot.end.getTime() - selectedSlot.start.getTime();
                          const durationHours = durationMs / (1000 * 60 * 60);
                          const totalPrice = (durationHours * pricePerHour).toFixed(2);
                          return locale === "ar" ? `${totalPrice} ل.س` : `${totalPrice} SYP`;
                        })()}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 sm:gap-3 pt-1 sm:pt-2">
                <Button
                  className="flex-1 cursor-pointer text-xs sm:text-sm h-8 sm:h-9"
                  disabled={loading || !selectedSlot}
                  style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
                  onClick={handleBook}
                >
                  {loading 
                    ? (locale === "ar" ? "جاري الحجز..." : "Booking…") 
                    : (locale === "ar" ? "تأكيد الحجز" : "Confirm Booking")
                  }
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1 cursor-pointer text-xs sm:text-sm h-8 sm:h-9"
                  onClick={() => { 
                    setOpen(false); 
                    setSelectedSlot(null); 
                  }}
                >
                  {locale === "ar" ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </DialogBody>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
