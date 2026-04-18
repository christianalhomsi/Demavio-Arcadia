"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, Save, Monitor, Hash, AlertTriangle, Clock } from "lucide-react";
import WorkingHoursEditor from "@/components/ui/working-hours-editor";
import type { WorkingHours } from "@/types/hall";

export default function EditHallForm({ hallId, defaultName, defaultAddress, currentDeviceCount, defaultWorkingHours }: {
  hallId: string;
  defaultName: string;
  defaultAddress: string;
  currentDeviceCount: number;
  defaultWorkingHours?: WorkingHours[] | null;
}) {
  const router = useRouter();
  const [name, setName]           = useState(defaultName);
  const [address, setAddress]     = useState(defaultAddress);
  const [deviceCount, setDeviceCount] = useState(String(currentDeviceCount));
  const [prefix, setPrefix]       = useState("Station");
  const [pending, setPending]     = useState(false);
  const [workingHours, setWorkingHours] = useState<WorkingHours[]>(
    defaultWorkingHours || [
      { day: 0, open_time: "09:00", close_time: "23:00", is_open: true },
      { day: 1, open_time: "09:00", close_time: "23:00", is_open: true },
      { day: 2, open_time: "09:00", close_time: "23:00", is_open: true },
      { day: 3, open_time: "09:00", close_time: "23:00", is_open: true },
      { day: 4, open_time: "09:00", close_time: "23:00", is_open: true },
      { day: 5, open_time: "09:00", close_time: "23:00", is_open: true },
      { day: 6, open_time: "09:00", close_time: "23:00", is_open: true },
    ]
  );

  const targetCount = parseInt(deviceCount) || 0;
  const diff = targetCount - currentDeviceCount;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Hall name is required."); return; }
    if (targetCount < 1) { toast.error("Device count must be at least 1."); return; }
    setPending(true);
    try {
      const res = await fetch(`/api/admin/halls/${hallId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || null,
          device_count: targetCount,
          device_prefix: prefix.trim() || "Station",
          working_hours: workingHours,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(typeof data.error === "string" ? data.error : "Failed to update hall."); return; }
      toast.success("Hall updated successfully!");
      router.push("/admin/halls");
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-lg">

      {/* Hall info */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40"
          style={{ background: "oklch(0.55 0.26 280 / 0.05)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.25)" }}>
            <Building2 size={15} style={{ color: "oklch(0.65 0.22 280)" }} />
          </div>
          <p className="text-sm font-semibold text-foreground">Hall Information</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-medium text-muted-foreground">Hall name</Label>
            <div className="relative">
              <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
              <Input id="name" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Downtown Arena" required autoComplete="off" className="pl-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address" className="text-xs font-medium text-muted-foreground">Address (optional)</Label>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
              <Input id="address" value={address} onChange={e => setAddress(e.target.value)}
                placeholder="123 Main St" autoComplete="off" className="pl-9" />
            </div>
          </div>
        </div>
      </div>

      {/* Devices */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40"
          style={{ background: "oklch(0.82 0.14 200 / 0.05)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "oklch(0.82 0.14 200 / 0.15)", border: "1px solid oklch(0.82 0.14 200 / 0.25)" }}>
            <Monitor size={15} style={{ color: "oklch(0.82 0.14 200)" }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Devices</p>
            <p className="text-xs text-muted-foreground mt-0.5">Currently {currentDeviceCount} device{currentDeviceCount !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="device_count" className="text-xs font-medium text-muted-foreground">Total devices</Label>
              <div className="relative">
                <Monitor size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
                <Input id="device_count" type="number" min={1} max={500}
                  value={deviceCount} onChange={e => setDeviceCount(e.target.value)}
                  className="pl-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prefix" className="text-xs font-medium text-muted-foreground">Name prefix (for new)</Label>
              <div className="relative">
                <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
                <Input id="prefix" value={prefix} onChange={e => setPrefix(e.target.value)}
                  placeholder="Station" className="pl-9" />
              </div>
            </div>
          </div>

          {/* diff indicator */}
          {diff !== 0 && targetCount >= 1 && (
            <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
              diff > 0
                ? "bg-green-500/10 border border-green-500/20 text-green-400"
                : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
            }`}>
              {diff < 0 && <AlertTriangle size={13} className="shrink-0" />}
              <Monitor size={13} className="shrink-0" />
              {diff > 0
                ? `${diff} device${diff !== 1 ? "s" : ""} will be added`
                : `${Math.abs(diff)} available device${Math.abs(diff) !== 1 ? "s" : ""} will be removed`}
            </div>
          )}

          {diff < 0 && (
            <p className="text-xs text-muted-foreground">
              Note: only <span className="text-foreground font-medium">available</span> devices will be removed. Active or reserved devices are kept.
            </p>
          )}
        </div>
      </div>

      {/* Working Hours */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40"
          style={{ background: "oklch(0.65 0.20 140 / 0.05)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "oklch(0.65 0.20 140 / 0.15)", border: "1px solid oklch(0.65 0.20 140 / 0.25)" }}>
            <Clock size={15} style={{ color: "oklch(0.65 0.20 140)" }} />
          </div>
          <p className="text-sm font-semibold text-foreground">Working Hours</p>
        </div>
        <div className="p-5">
          <WorkingHoursEditor value={workingHours} onChange={setWorkingHours} />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending} className="gap-2 font-semibold"
          style={{ background: "oklch(0.55 0.26 280)", color: "white", boxShadow: "0 4px 14px oklch(0.55 0.26 280 / 0.3)" }}>
          {pending
            ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            : <Save size={15} />}
          {pending ? "Saving…" : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
