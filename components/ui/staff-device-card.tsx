"use client";

import { useState } from "react";
import type { DeviceStatus } from "@/services/devices";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Monitor, Timer, Clock, WifiOff, LogIn, StopCircle, CheckCircle2, Calendar } from "lucide-react";
import CalendarBooking from "@/components/ui/calendar-booking";

export type StaffDeviceCardProps = {
  id: string;
  name: string;
  status: DeviceStatus;
  hallId: string;
  pendingReservation: { id: string } | null;
  activeSession: { id: string; started_at: string } | null;
};

const STATUS: Record<DeviceStatus, { cls: string; label: string; icon: React.ElementType }> = {
  available: { cls: "badge-available", label: "Available", icon: CheckCircle2 },
  active:    { cls: "badge-active",    label: "Active",    icon: Timer },
  offline:   { cls: "badge-offline",   label: "Offline",   icon: WifiOff },
  idle:      { cls: "badge-idle",      label: "Reserved",  icon: Clock },
};

function elapsed(startedAt: string): string {
  const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function StaffDeviceCard(props: StaffDeviceCardProps) {
  const { id, name, hallId, pendingReservation, activeSession } = props;
  const [status, setStatus]           = useState<DeviceStatus>(props.status);
  const [session, setSession]         = useState(activeSession);
  const [reservation, setReservation] = useState(pendingReservation);
  const [ratePerHour, setRatePerHour] = useState("");
  const [showEndForm, setShowEndForm] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [loading, setLoading]         = useState(false);

  async function handleCheckIn() {
    if (!reservation) return;
    setLoading(true);
    const res = await fetch("/api/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservation.id, device_id: id, hall_id: hallId }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      setStatus("active");
      setSession({ id: data.id, started_at: data.started_at });
      setReservation(null);
      toast.success(`${name} — session started`);
    } else {
      const json = await res.json().catch(() => ({}));
      toast.error(json?.error ?? "Check-in failed.");
    }
  }

  async function handleEndSession() {
    if (!session) return;
    const rate = parseFloat(ratePerHour);
    if (!rate || rate <= 0) { toast.error("Enter a valid rate per hour."); return; }
    setLoading(true);
    const res = await fetch(`/api/sessions/${session.id}/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hall_id: hallId, rate_per_hour: rate }),
    });
    setLoading(false);
    if (res.ok) {
      setStatus("available");
      setSession(null);
      setShowEndForm(false);
      setRatePerHour("");
      toast.success(`${name} — session ended`);
    } else {
      const json = await res.json().catch(() => ({}));
      toast.error(json?.error ?? "Failed to end session.");
    }
  }

  async function handleBookDevice() {
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
        device_id: id,
        start_time: selectedSlot.start.toISOString(),
        end_time: selectedSlot.end.toISOString(),
      }),
    });
    setLoading(false);
    if (res.status === 201) {
      toast.success("Device booked successfully!");
      setShowBooking(false);
      setSelectedSlot(null);
    } else {
      const json = await res.json().catch(() => ({} as { error?: string }));
      const errMsg = (json?.error as string) ?? "Something went wrong.";
      if (errMsg === "OVERLAP") toast.error("Time slot already taken.");
      else toast.error(errMsg);
    }
  }

  const s = STATUS[status] ?? STATUS.offline;
  const StatusIcon = s.icon;

  return (
    <Card className="border-border/60 hover:border-border transition-colors">
      <CardContent className="pt-4 space-y-3">
        {/* header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Monitor size={15} className="text-muted-foreground shrink-0" />
            <p className="text-sm font-semibold text-foreground truncate">{name}</p>
          </div>
          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${s.cls}`}>
            <StatusIcon size={11} />
            {s.label}
          </span>
        </div>

        {/* session info */}
        {status === "active" && session && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
            Running · {elapsed(session.started_at)}
          </p>
        )}
        {status === "idle" && reservation && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            Confirmed reservation waiting
          </p>
        )}

        {/* check-in */}
        {status === "idle" && reservation && !loading && (
          <Button
            size="sm"
            className="w-full text-xs cursor-pointer gap-1.5"
            style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
            onClick={handleCheckIn}
          >
            <LogIn size={13} />
            Check in
          </Button>
        )}

        {/* book device */}
        {status === "available" && !showBooking && (
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs cursor-pointer gap-1.5"
            onClick={() => setShowBooking(true)}
          >
            <Calendar size={13} />
            Book device
          </Button>
        )}

        <Dialog open={showBooking} onOpenChange={setShowBooking}>
          <DialogContent onClose={() => setShowBooking(false)}>
            <DialogHeader>
              <DialogTitle>Book {name}</DialogTitle>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Booking Date</Label>
                <Input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="h-9"
                />
              </div>
              {bookingDate && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Select Time Slot (30 min)</Label>
                  <CalendarBooking
                    deviceId={id}
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
                  onClick={handleBookDevice}
                >
                  {loading ? "Booking…" : "Confirm Booking"}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 cursor-pointer"
                  onClick={() => { setShowBooking(false); setSelectedSlot(null); }}
                >
                  Cancel
                </Button>
              </div>
            </DialogBody>
          </DialogContent>
        </Dialog>

        {/* end session */}
        {status === "active" && session && !showEndForm && (
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs cursor-pointer gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => setShowEndForm(true)}
          >
            <StopCircle size={13} />
            End session
          </Button>
        )}

        {/* end session form */}
        {showEndForm && (
          <div className="space-y-3 pt-1 border-t border-border/40">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Rate / hour</Label>
              <Input
                type="number" min="0" step="0.01" placeholder="e.g. 5.00"
                value={ratePerHour} onChange={(e) => setRatePerHour(e.target.value)}
                className="text-xs h-8"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 text-xs cursor-pointer"
                disabled={loading || !ratePerHour}
                style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
                onClick={handleEndSession}
              >
                {loading ? "Ending…" : "Confirm"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs cursor-pointer"
                onClick={() => { setShowEndForm(false); setRatePerHour(""); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {loading && !showEndForm && (
          <p className="text-xs text-muted-foreground text-center">Processing…</p>
        )}
      </CardContent>
    </Card>
  );
}
