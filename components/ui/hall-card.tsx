import Link from "next/link";
import type { Hall } from "@/types/hall";
import { MapPin, ArrowRight, Building2 } from "lucide-react";
import { useTranslations } from "next-intl";

type DeviceStats = { total: number; available: number; active: number; offline: number };

export default function HallCard({ hall, stats }: { hall: Hall; stats: DeviceStats }) {
  const t = useTranslations("halls");

  return (
    <Link href={`/halls/${hall.id}`} className="group block">
      <div className="relative rounded-2xl border border-border/60 bg-card hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 overflow-hidden">
        
        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        <div className="relative p-6 space-y-4">
          
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ 
                  background: "linear-gradient(135deg, oklch(0.55 0.26 280 / 0.15), oklch(0.55 0.26 280 / 0.08))",
                  border: "1px solid oklch(0.55 0.26 280 / 0.3)"
                }}
              >
                <Building2 size={24} style={{ color: "oklch(0.65 0.22 280)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors truncate">
                  {hall.name}
                </h3>
                {hall.address && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 truncate">
                    <MapPin size={12} className="shrink-0" />
                    <span className="truncate">{hall.address}</span>
                  </p>
                )}
              </div>
            </div>
            
            <div 
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0"
              style={{
                background: "oklch(0.45 0.20 145 / 0.1)",
                border: "1px solid oklch(0.45 0.20 145 / 0.3)"
              }}
            >
              <span 
                className="w-2 h-2 rounded-full animate-pulse" 
                style={{ background: "oklch(0.65 0.20 145)" }}
              />
              <span 
                className="text-xs font-medium" 
                style={{ color: "oklch(0.65 0.20 145)" }}
              >
                {t("open")}
              </span>
            </div>
          </div>

          {/* Total Devices - Simple Display */}
          <div 
            className="flex items-center justify-between p-4 rounded-xl"
            style={{
              background: "oklch(0.55 0.26 280 / 0.05)",
              border: "1px solid oklch(0.55 0.26 280 / 0.15)"
            }}
          >
            <div>
              <div className="text-sm text-muted-foreground">{t("totalDevices")}</div>
              <div className="text-2xl font-bold text-foreground mt-1">{stats.total}</div>
            </div>
            <div 
              className="w-16 h-16 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, oklch(0.55 0.26 280 / 0.2), oklch(0.55 0.26 280 / 0.1))",
                border: "1px solid oklch(0.55 0.26 280 / 0.3)"
              }}
            >
              <Building2 size={32} style={{ color: "oklch(0.65 0.22 280)" }} />
            </div>
          </div>

          {/* Footer - Book Now */}
          <div className="flex items-center justify-end pt-2 border-t border-border/40">
            <div 
              className="flex items-center gap-2 text-sm font-semibold opacity-70 group-hover:opacity-100 transition-all"
              style={{ color: "oklch(0.65 0.22 280)" }}
            >
              <span>{t("bookNow")}</span>
              <ArrowRight 
                size={16} 
                className="group-hover:translate-x-1 transition-transform" 
              />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
