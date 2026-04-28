import Link from "next/link";
import type { Hall } from "@/types/hall";
import { MapPin, ArrowRight, Gamepad2, Wifi } from "lucide-react";
import { useTranslations } from "next-intl";

type DeviceStats = { total: number; available: number; active: number; offline: number };

export default function HallCard({ hall, stats }: { hall: Hall; stats: DeviceStats }) {
  const t = useTranslations("halls");
  const availablePct = stats.total > 0 ? (stats.available / stats.total) * 100 : 0;

  return (
    <Link href={`/halls/${hall.id}`} className="group block">
      <div className="relative rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 p-[1px] overflow-hidden transition-all duration-300 hover:scale-[1.02]">
        
        {/* Animated border gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/50 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        <div className="relative rounded-xl sm:rounded-2xl bg-slate-950 p-4 sm:p-6 space-y-4 sm:space-y-5">
          
          {/* Header */}
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center border border-purple-500/30 shrink-0">
                <Gamepad2 className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base sm:text-lg text-white group-hover:text-purple-300 transition-colors truncate">
                  {hall.name}
                </h3>
                {hall.address && (
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                    <MapPin size={10} className="shrink-0" />
                    <span className="truncate">{hall.address}</span>
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-green-500/10 border border-green-500/30 shrink-0">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] sm:text-xs font-medium text-green-400">{t("open")}</span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-slate-900/50 rounded-lg p-2 sm:p-3 border border-slate-800">
              <div className="text-xl sm:text-2xl font-bold text-white">{stats.available}</div>
              <div className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1">{t("available")}</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2 sm:p-3 border border-slate-800">
              <div className="text-xl sm:text-2xl font-bold text-blue-400">{stats.active}</div>
              <div className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1">{t("statusActive")}</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2 sm:p-3 border border-slate-800">
              <div className="text-xl sm:text-2xl font-bold text-slate-500">{stats.offline}</div>
              <div className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1">{t("offline")}</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5 sm:space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{t("capacity")}</span>
              <span className="font-semibold text-white">{stats.available}/{stats.total}</span>
            </div>
            <div className="h-1.5 sm:h-2 rounded-full bg-slate-800 overflow-hidden">
              <div 
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500"
                style={{ width: `${availablePct}%` }}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-800">
            <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-400">
              <Wifi size={12} className="shrink-0" />
              <span>{stats.total} {t("totalDevices")}</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-semibold text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="hidden sm:inline">{t("bookNow")}</span>
              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
