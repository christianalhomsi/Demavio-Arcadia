"use client";

import type { DeviceStatus } from "@/services/devices";
import { Card, CardContent } from "@/components/ui/card";
import { Monitor, Timer, Clock, WifiOff, CheckCircle2, StopCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import SessionModal from "@/components/ui/session-modal";
import { useState, useEffect } from "react";

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
  const [currentSession, setCurrentSession] = useState(activeSession);

  // Update session when activeSession prop changes
  useEffect(() => {
    setCurrentSession(activeSession);
  }, [activeSession]);

  const s = STATUS[status] ?? STATUS.offline;
  const StatusIcon = s.icon;

  function handleDoubleClick() {
    if (currentSession) {
      setShowSessionModal(true);
    }
  }

  function handleSessionEnd() {
    setCurrentSession(null);
  }

  return (
    <>
      <Card 
        className="border-border/60 hover:border-primary/50 transition-all hover:shadow-lg group relative overflow-hidden cursor-pointer"
        onDoubleClick={handleDoubleClick}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        
        <CardContent className="pt-3 sm:pt-4 pb-3 sm:pb-4 space-y-2 sm:space-y-2.5 relative">
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300"
                style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1.5px solid oklch(0.55 0.26 280 / 0.4)" }}
              >
                <Monitor size={14} className="sm:w-4 sm:h-4" style={{ color: "oklch(0.65 0.22 280)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-bold text-foreground truncate">{name}</p>
              </div>
            </div>
            <span className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full shrink-0 ${s.cls}`}>
              <StatusIcon size={12} className="sm:w-[14px] sm:h-[14px]" />
            </span>
          </div>

          {currentSession && (status === "active" || status === "paused") && (
            <div className={`flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg ${
              status === "paused" 
                ? "bg-orange-500/10 border border-orange-500/20" 
                : "bg-blue-500/10 border border-blue-500/20"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                status === "paused" ? "bg-orange-400" : "bg-blue-400 animate-pulse"
              }`} />
              <p className={`text-[10px] sm:text-xs font-medium ${
                status === "paused" ? "text-orange-400" : "text-blue-400"
              }`}>
                {status === "paused" ? t("paused") : t("running")} · {elapsed(currentSession.started_at)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {currentSession && (
        <SessionModal
          open={showSessionModal}
          onClose={() => setShowSessionModal(false)}
          sessionId={currentSession.id}
          deviceName={name}
          hallId={hallId}
          startedAt={currentSession.started_at}
          userId={currentSession.user_id}
          guestName={currentSession.guest_name}
          onSessionEnd={handleSessionEnd}
        />
      )}
    </>
  );
}
