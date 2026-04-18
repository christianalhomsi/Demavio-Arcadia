import Link from "next/link";
import type { Hall } from "@/types/hall";
import { MapPin, ArrowRight, Monitor, CheckCircle2, Timer, WifiOff } from "lucide-react";

type DeviceStats = { total: number; available: number; active: number; offline: number };

export default function HallCard({ hall, stats }: { hall: Hall; stats: DeviceStats }) {
  const availablePct = stats.total > 0 ? (stats.available / stats.total) * 100 : 0;

  return (
    <Link href={`/halls/${hall.id}`} className="group block">
      <div className="relative rounded-2xl border border-border/50 bg-card overflow-hidden transition-all duration-300 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1">

        {/* top accent line */}
        <div className="absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, oklch(0.55 0.26 280 / 0.6), oklch(0.82 0.14 200 / 0.3), transparent)" }} />

        {/* bg glow */}
        <div className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle at 15% 50%, oklch(0.55 0.26 280) 0%, transparent 55%), radial-gradient(circle at 85% 10%, oklch(0.82 0.14 200) 0%, transparent 45%)" }} />

        <div className="relative p-5 flex flex-col gap-4">

          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105"
              style={{ background: "oklch(0.55 0.26 280 / 0.12)", border: "1px solid oklch(0.55 0.26 280 / 0.22)" }}>
              <Monitor size={22} style={{ color: "oklch(0.65 0.22 280)" }} />
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shrink-0 badge-available">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Open
            </span>
          </div>

          {/* ── Name & address ── */}
          <div>
            <h3 className="font-bold text-base text-foreground truncate transition-colors duration-200 group-hover:text-primary">
              {hall.name}
            </h3>
            {hall.address ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 truncate">
                <MapPin size={11} className="shrink-0 text-muted-foreground/60" />
                {hall.address}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/50 mt-1 italic">No address</p>
            )}
          </div>

          {/* ── Device stats ── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Availability</span>
              <span className="font-semibold tabular-nums" style={{
                color: availablePct > 50
                  ? "oklch(0.64 0.20 145)"
                  : availablePct > 0
                  ? "oklch(0.78 0.18 75)"
                  : "oklch(0.63 0.24 25)",
              }}>
                {stats.available}/{stats.total}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${availablePct}%`,
                  background: availablePct > 50
                    ? "linear-gradient(90deg, oklch(0.64 0.20 145), oklch(0.72 0.17 160))"
                    : availablePct > 0
                    ? "linear-gradient(90deg, oklch(0.78 0.18 75), oklch(0.82 0.16 90))"
                    : "oklch(0.63 0.24 25 / 0.5)",
                }} />
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 size={11} />
                {stats.available} free
              </span>
              {stats.active > 0 && (
                <span className="flex items-center gap-1 text-xs text-blue-400">
                  <Timer size={11} />
                  {stats.active} active
                </span>
              )}
              {stats.offline > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                  <WifiOff size={11} />
                  {stats.offline} offline
                </span>
              )}
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between pt-3 border-t border-border/30">
            <span className="text-xs text-muted-foreground/50">
              {stats.total} device{stats.total !== 1 ? "s" : ""} total
            </span>
            <span className="flex items-center gap-1 text-xs font-semibold text-primary translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-200">
              Book now
              <ArrowRight size={13} />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
