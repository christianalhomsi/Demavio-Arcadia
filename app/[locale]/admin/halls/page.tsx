import type { Metadata } from "next";
import Link from "next/link";
import { getHalls } from "@/services/halls";
import { getServerClient } from "@/lib/supabase/server";
import { Building2, Plus, MapPin, Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Admin — Halls" };

export default async function AdminHallsPage() {
  const t = await getTranslations('admin');
  const tCommon = await getTranslations('common');
  const supabase = await getServerClient();
  const halls = await getHalls();

  // get device counts per hall
  const { data: deviceData } = await supabase
    .from("devices")
    .select("hall_id, status");

  const deviceMap = new Map<string, { total: number; available: number }>();
  for (const d of deviceData ?? []) {
    const cur = deviceMap.get(d.hall_id) ?? { total: 0, available: 0 };
    cur.total++;
    if (d.status === "available") cur.available++;
    deviceMap.set(d.hall_id, cur);
  }

  return (
    <div className="space-y-6">

      {/* header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('halls')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('allHallsDesc')}</p>
        </div>
        <Link href="/admin/halls/new"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 shrink-0"
          style={{ background: "oklch(0.55 0.26 280)", boxShadow: "0 4px 14px oklch(0.55 0.26 280 / 0.3)" }}>
          <Plus size={15} />
          {t('newHall')}
        </Link>
      </div>

      {/* list */}
      {halls.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-dashed border-border/50">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "oklch(0.55 0.26 280 / 0.08)", border: "1px solid oklch(0.55 0.26 280 / 0.15)" }}>
            <Building2 size={24} className="text-muted-foreground" />
          </div>
          <p className="font-semibold text-foreground mb-1">{t('noHalls')}</p>
          <p className="text-sm text-muted-foreground mb-4">{t('createFirstHall')}</p>
          <Link href="/admin/halls/new"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white"
            style={{ background: "oklch(0.55 0.26 280)" }}>
            <Plus size={13} />
            {t('createHall')}
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          {halls.map((h, i) => {
            const devices = deviceMap.get(h.id) ?? { total: 0, available: 0 };
            return (
              <div key={h.id}
                className={`flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors ${i !== 0 ? "border-t border-border/30" : ""}`}>

                {/* icon */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "oklch(0.55 0.26 280 / 0.1)", border: "1px solid oklch(0.55 0.26 280 / 0.2)" }}>
                  <Building2 size={18} style={{ color: "oklch(0.65 0.22 280)" }} />
                </div>

                {/* info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{h.name}</p>
                  {h.address && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                      <MapPin size={10} className="shrink-0" />
                      {h.address}
                    </p>
                  )}
                </div>

                {/* device count */}
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                  <span>
                    <span className="text-green-400 font-medium">{devices.available}</span>
                    <span className="text-muted-foreground/60">/{devices.total}</span>
                  </span>
                </div>

                {/* actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/admin/halls/${h.id}`}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                    <Pencil size={12} />
                    {tCommon('edit')}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
