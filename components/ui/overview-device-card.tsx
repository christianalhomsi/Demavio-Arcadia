"use client";

import type { DeviceStatus } from "@/services/devices";
import { Card, CardContent } from "@/components/ui/card";
import { Monitor, Timer, Clock, WifiOff, CheckCircle2, StopCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import SessionModal from "@/components/ui/session-modal";
import { useState } from "react";

type Props = {
  id: string;
  name: string;
  status: DeviceStatus;
  hallId: string;
  activeSession: { id: string; started_at: string; user_id: string | null; guest_name: string | null } | null;
};

const STATUS: Record<DeviceStatus, { cls: string; icon: React.ElementType }> = {
  available: { cls: "badge-available", icon: CheckCircle2 },
  active:    { cls: "badge-active",    icon: Timer },
  offline:   { cls: "badge-offline",   icon: WifiOff },
  idle:      { cls: "badge-idle",      icon: Clock },
  paused:    { cls: "badge-paused",    icon: StopCircle },
};

function elapsed(startedAt: string): string {
  const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function OverviewDeviceCard({ id, name, status, hallId, activeSession }: Props) {
  const t = useTranslations("devices");
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [session, setSession] = useState(activeSession);

  const s = STATUS[status] ?? STATUS.offline;
  const StatusIcon = s.icon;

  function handleDoubleClick() {
    if (session) {
      setShowSessionModal(true);
    }
  }

  function handleSessionEnd() {
    setSession(null);
  }

  return (
    <>
      <Card 
        className="border-border/60 hover:border-primary/50 transition-all hover:shadow-lg group relative overflow-hidden cursor-pointer"
        onDoubleClick={handleDoubleClick}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        
        <CardContent className="pt-4 pb-4 space-y-2.5 relative">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300"
                style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1.5px solid oklch(0.55 0.26 280 / 0.4)" }}
              >
                <Monitor size={16} style={{ color: "oklch(0.65 0.22 280)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground truncate">{name}</p>
              </div>
            </div>
            <span className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${s.cls}`}>
              <StatusIcon size={14} />
            </span>
          </div>

          {status === "active" && session && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
              <p className="text-xs font-medium text-blue-400">
                {t("running")} · {elapsed(session.started_at)}
              </p>
            </div>
          )}
          {status === "paused" && session && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
              <p className="text-xs font-medium text-orange-400">
                {t("paused")} · {elapsed(session.started_at)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {session && (
        <SessionModal
          open={showSessionModal}
          onClose={() => setShowSessionModal(false)}
          sessionId={session.id}
          deviceName={name}
          hallId={hallId}
          startedAt={session.started_at}
          userId={session.user_id}
          guestName={session.guest_name}
          onSessionEnd={handleSessionEnd}
        />
      )}
    </>
  );
}
