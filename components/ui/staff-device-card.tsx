"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DeviceStatus } from "@/services/devices";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Monitor, Timer, Clock, WifiOff, LogIn, StopCircle, CheckCircle2, Calendar } from "lucide-react";
import DeviceCalendarView from "@/components/ui/device-calendar-view";

export type StaffDeviceCardProps = {
  id: string;
  name: string;
  status: DeviceStatus;
  hallId: string;
  pendingReservation: { id: string } | null;
  activeSession: { id: string; started_at: string } | null;
};

const STATUS: Record<DeviceStatus, { cls: string; labelKey: string; icon: React.ElementType }> = {
  available: { cls: "badge-available", labelKey: "available", icon: CheckCircle2 },
  active:    { cls: "badge-active",    labelKey: "active",    icon: Timer },
  offline:   { cls: "badge-offline",   labelKey: "offline",   icon: WifiOff },
  idle:      { cls: "badge-idle",      labelKey: "idle",  icon: Clock },
};

function elapsed(startedAt: string): string {
  const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function StaffDeviceCard(props: StaffDeviceCardProps) {
  const { id, name, hallId, pendingReservation, activeSession } = props;
  const t = useTranslations("devices");
  const tc = useTranslations("common");
  const [status, setStatus]           = useState<DeviceStatus>(props.status);
  const [session, setSession]         = useState(activeSession);
  const [reservation, setReservation] = useState(pendingReservation);
  const [ratePerHour, setRatePerHour] = useState("");
  const [showEndForm, setShowEndForm] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
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
      toast.success(`${name} — ${t("sessionStarted")}`);
    } else {
      const json = await res.json().catch(() => ({}));
      toast.error(json?.error ?? t("checkInFailed"));
    }
  }

  async function handleEndSession() {
    if (!session) return;
    const rate = parseFloat(ratePerHour);
    if (!rate || rate <= 0) { toast.error(t("enterValidRate")); return; }
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
      toast.success(`${name} — ${t("sessionEnded")}`);
    } else {
      const json = await res.json().catch(() => ({}));
      toast.error(json?.error ?? t("failedToEnd"));
    }
  }



  const s = STATUS[status] ?? STATUS.offline;
  const StatusIcon = s.icon;

  return (
    <>
    <Card className="border-border/60 hover:border-primary/50 transition-all hover:shadow-xl group relative overflow-hidden">
      {/* Gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      <CardContent className="pt-5 pb-4 space-y-3 relative">
        {/* header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300"
              style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1.5px solid oklch(0.55 0.26 280 / 0.4)" }}
            >
              <Monitor size={18} style={{ color: "oklch(0.65 0.22 280)" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground truncate">{name}</p>
              <p className="text-xs text-muted-foreground">ID: {id.slice(0, 8)}</p>
            </div>
          </div>
          <span className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${s.cls}`}>
            <StatusIcon size={16} />
          </span>
        </div>

        {/* session info */}
        {status === "active" && session && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <p className="text-xs font-medium text-blue-400">
              {t("running")} · {elapsed(session.started_at)}
            </p>
          </div>
        )}
        {status === "idle" && reservation && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <p className="text-xs font-medium text-amber-400">
              {t("confirmedReservation")}
            </p>
          </div>
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
            {t("checkIn")}
          </Button>
        )}

        {/* calendar view */}
        {!showEndForm && (
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs font-semibold cursor-pointer gap-2 border-primary/50 text-primary hover:bg-primary/15 hover:border-primary transition-all"
            onClick={() => setShowCalendar(true)}
          >
            <Calendar size={14} />
            {t("viewCalendar")}
          </Button>
        )}

        {/* end session */}
        {status === "active" && session && !showEndForm && (
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs cursor-pointer gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => setShowEndForm(true)}
          >
            <StopCircle size={13} />
            {t("endSession")}
          </Button>
        )}

        {/* end session form */}
        {showEndForm && (
          <div className="space-y-3 pt-1 border-t border-border/40">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("ratePerHour")}</Label>
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
                {loading ? t("ending") : t("confirm")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs cursor-pointer"
                onClick={() => { setShowEndForm(false); setRatePerHour(""); }}
              >
                {tc("cancel")}
              </Button>
            </div>
          </div>
        )}

        {loading && !showEndForm && (
          <p className="text-xs text-muted-foreground text-center">{t("processing")}</p>
        )}
      </CardContent>
    </Card>
    
    <DeviceCalendarView
      deviceId={id}
      deviceName={name}
      hallId={hallId}
      open={showCalendar}
      onClose={() => setShowCalendar(false)}
    />
    </>
  );
}
