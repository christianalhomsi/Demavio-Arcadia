import Link from "next/link";
import type { Hall } from "@/types/hall";
import { MapPin, ArrowRight, Gamepad2, Wifi } from "lucide-react";

type DeviceStats = { total: number; available: number; active: number; offline: number };

export default function HallCard({ hall, stats }: { hall: Hall; stats: DeviceStats }) {
  const availablePct = stats.total > 0 ? (stats.available / stats.total) * 100 : 0;

  return (
    <Link href={`/halls/${hall.id}`} className="group block">
      <div className="relative rounded-2xl bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 p-[1px] overflow-hidden transition-all duration-300 hover:scale-[1.02]">
        
        {/* Animated border gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/50 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        <div className="relative rounded-2xl bg-slate-950 p-6 space-y-5">
          
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center border border-purple-500/30">
                <Gamepad2 size={24} className="text-purple-400" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white group-hover:text-purple-300 transition-colors">
                  {hall.name}
                </h3>
                {hall.address && (
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                    <MapPin size={10} />
                    {hall.address}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/30">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs font-medium text-green-400">Open</span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
              <div className="text-2xl font-bold text-white">{stats.available}</div>
              <div className="text-xs text-slate-400 mt-1">Available</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
              <div className="text-2xl font-bold text-blue-400">{stats.active}</div>
              <div className="text-xs text-slate-400 mt-1">Active</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
              <div className="text-2xl font-bold text-slate-500">{stats.offline}</div>
              <div className="text-xs text-slate-400 mt-1">Offline</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Capacity</span>
              <span className="font-semibold text-white">{stats.available}/{stats.total}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div 
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500"
                style={{ width: `${availablePct}%` }}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Wifi size={12} />
              <span>{stats.total} Devices</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
              <span>Book Now</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
