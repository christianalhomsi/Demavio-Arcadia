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

const STATUS: Record<DeviceStatus, { bg: string; border: string; text: string; icon: React.ElementType }> = {
  available: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-400", icon: CheckCircle2 },
  active:    { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", icon: Timer },
  offline:   { bg: "bg-slate-500/10", border: "border-slate-500/30", text: "text-slate-400", icon: WifiOff },
  idle:      { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", icon: Clock },
  paused:    { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", icon: StopCircle },
};

function elapsed(startedAt: string): string {
  const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function OverviewDeviceCard({ id, name, status, hallId, activeSession }: Props) {
  const t = useTranslations("devices");
  const [showSessionModal, setShowSessionModal] = useState(false);

  // Sync with server state - if no active session or status changed, clear local state
  const shouldShowSession = activeSession && (status === "active" || status === "paused");

  const s = STATUS[status] ?? STATUS.offline;
  const StatusIcon = s.icon;

  function handleDoubleClick() {
    if (shouldShowSession) {
      setShowSessionModal(true);
    }
  }

  function handleSessionEnd() {
    // Session ended, modal will close and page will revalidate
  }

  return (
    <>
      <Card 
        className={`border-2 ${s.border} ${s.bg} hover:border-primary/50 transition-all hover:shadow-lg group relative overflow-hidden cursor-pointer`}
        onDoubleClick={handleDoubleClick}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        
        <CardContent className="pt-3 sm:pt-4 pb-3 sm:pb-4 space-y-2 sm:space-y-2.5 relative">
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300 ${s.bg} border ${s.border}`}
              >
                <Monitor size={14} className={`sm:w-4 sm:h-4 ${s.text}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-xs sm:text-sm font-bold truncate ${s.text}`}>{name}</p>
              </div>
            </div>
            <span className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full shrink-0 ${s.bg} border ${s.border}`}>
              <StatusIcon size={12} className={`sm:w-[14px] sm:h-[14px] ${s.text}`} />
            </span>
          </div>

          {shouldShowSession && (
            <div className={`flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg border ${
              status === "paused" 
                ? "bg-orange-500/15 border-orange-500/30" 
                : "bg-blue-500/15 border-blue-500/30"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                status === "paused" ? "bg-orange-400" : "bg-blue-400 animate-pulse"
              }`} />
              <p className={`text-[10px] sm:text-xs font-medium ${
                status === "paused" ? "text-orange-400" : "text-blue-400"
              }`}>
                {status === "paused" ? t("paused") : t("running")} · {elapsed(activeSession.started_at)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {shouldShowSession && (
        <SessionModal
          open={showSessionModal}
          onClose={() => setShowSessionModal(false)}
          sessionId={activeSession.id}
          deviceId={id}
          deviceName={name}
          hallId={hallId}
          startedAt={activeSession.started_at}
          userId={activeSession.user_id}
          guestName={activeSession.guest_name}
          onSessionEnd={handleSessionEnd}
        />
      )}
    </>
  );
}
