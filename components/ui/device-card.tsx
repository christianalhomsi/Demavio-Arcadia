"use client";

import { useState } from "react";
import type { Device, DeviceStatus } from "@/services/devices";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Monitor, CheckCircle2, Timer, Clock, WifiOff, CalendarPlus } from "lucide-react";
import CalendarBooking from "@/components/ui/calendar-booking";

const STATUS: Record<DeviceStatus, { cls: string; label: string; icon: React.ElementType }> = {
  available: { cls: "badge-available", label: "Available", icon: CheckCircle2 },
  active:    { cls: "badge-active",    label: "Active",    icon: Timer },
  offline:   { cls: "badge-offline",   label: "Offline",   icon: WifiOff },
  idle:      { cls: "badge-idle",      label: "Reserved",  icon: Clock },
};

export default function DeviceCard({ device, hallId }: { device: Device; hallId: string }) {
  const [open, setOpen]           = useState(false);
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [loading, setLoading]     = useState(false);
  const [booked, setBooked]       = useState(false);

  async function handleBook() {
    if (!selectedSlot) {
      toast.error("Please select a time slot");
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
      toast.success("Device booked successfully!");
    } else {
      const json = await res.json().catch(() => ({}));
      const msg = json?.error ?? "Booking failed.";
      if (msg === "OVERLAP") toast.error("Time slot already taken. Choose another time.");
      else toast.error(msg);
    }
  }

  const s = STATUS[device.status] ?? STATUS.offline;
  const StatusIcon = s.icon;
  const canBook = device.status === "available" && !booked;

  return (
    <Card className="border-border/60 hover:border-border transition-colors">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Monitor size={15} className="text-muted-foreground shrink-0" />
            <p className="text-sm font-semibold text-foreground truncate">{device.name}</p>
          </div>
          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${booked ? "badge-idle" : s.cls}`}>
            <StatusIcon size={11} />
            {booked ? "Reserved" : s.label}
          </span>
        </div>

        {canBook && !open && (
          <Button
            size="sm"
            className="w-full text-xs cursor-pointer gap-1.5"
            style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
            onClick={() => setOpen(true)}
          >
            <CalendarPlus size={13} />
            Book this device
          </Button>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent onClose={() => setOpen(false)}>
            <DialogHeader>
              <DialogTitle>Book {device.name}</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Booking Date</Label>
                <Input type="date" value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)} className="h-9" />
              </div>
              {bookingDate && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Select Time Slot (30 min)</Label>
                  <CalendarBooking
                    deviceId={device.id}
                    hallId={hallId}
                    selectedDate={new Date(bookingDate)}
                    onSelectSlot={(start, end) => setSelectedSlot({ start, end })}
                  />
                </div>
              )}
              {selectedSlot && (
                <div className="p-3 rounded-lg bg-muted/50 text-sm">
                  <span className="text-muted-foreground">Selected: </span>
                  <span className="font-medium">
                    {selectedSlot.start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                    {" - "}
                    {selectedSlot.end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                  </span>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <Button
                  className="flex-1 cursor-pointer"
                  disabled={loading || !selectedSlot}
                  style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
                  onClick={handleBook}
                >
                  {loading ? "Booking…" : "Confirm Booking"}
                </Button>
                <Button variant="outline" className="flex-1 cursor-pointer"
                  onClick={() => { setOpen(false); setSelectedSlot(null); }}>
                  Cancel
                </Button>
              </div>
            </DialogBody>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
