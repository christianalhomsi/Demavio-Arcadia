"use client";

import { useState } from "react";
import type { Device, DeviceStatus } from "@/services/devices";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const STATUS: Record<DeviceStatus, { cls: string; label: string }> = {
  available: { cls: "badge-available", label: "Available" },
  active:    { cls: "badge-active",    label: "Active" },
  offline:   { cls: "badge-offline",   label: "Offline" },
  idle:      { cls: "badge-idle",      label: "Reserved" },
};

export default function DeviceCard({ device, hallId }: { device: Device; hallId: string }) {
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [booked, setBooked] = useState(false);

  async function handleBook() {
    setLoading(true);
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hall_id: hallId, device_id: device.id, start_time: startTime, end_time: endTime }),
    });
    setLoading(false);
    if (res.ok) {
      setBooked(true);
      setOpen(false);
      toast.success("Device booked successfully!");
    } else {
      const json = await res.json().catch(() => ({}));
      const msg = json?.error ?? "Booking failed.";
      if (msg === "OVERLAP") toast.error("Time slot already taken. Choose another time.");
      else toast.error(msg);
    }
  }

  const s = STATUS[device.status] ?? STATUS.offline;
  const canBook = device.status === "available" && !booked;

  return (
    <Card className="border-border/60 hover:border-border transition-colors">
      <CardContent className="pt-4 space-y-3">
        {/* header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">🖥</span>
            <p className="text-sm font-semibold text-foreground truncate">{device.name}</p>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${booked ? "badge-idle" : s.cls}`}>
            {booked ? "Reserved" : s.label}
          </span>
        </div>

        {/* book button */}
        {canBook && !open && (
          <Button size="sm" className="w-full text-xs cursor-pointer"
            style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
            onClick={() => setOpen(true)}>
            Book this device
          </Button>
        )}

        {/* booking form */}
        {open && (
          <div className="space-y-3 pt-1 border-t border-border/40">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Start time</Label>
              <Input type="datetime-local" value={startTime}
                onChange={(e) => setStartTime(e.target.value)} className="text-xs h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">End time</Label>
              <Input type="datetime-local" value={endTime}
                onChange={(e) => setEndTime(e.target.value)} className="text-xs h-8" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 text-xs cursor-pointer"
                disabled={loading || !startTime || !endTime}
                style={{ background: "oklch(0.55 0.26 280)", color: "white" }}
                onClick={handleBook}>
                {loading ? "Booking…" : "Confirm"}
              </Button>
              <Button size="sm" variant="outline" className="flex-1 text-xs cursor-pointer"
                onClick={() => { setOpen(false); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
