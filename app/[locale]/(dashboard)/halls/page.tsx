import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { getHalls } from "@/services/halls";
import { isSuperAdmin } from "@/services/access";
import HallCard from "@/components/ui/hall-card";
import { Skeleton } from "@/components/ui/skeleton";
import LogoutButton from "@/components/ui/logout-button";
import { LanguageToggle } from "@/components/language-toggle";
import { HALL_DASHBOARD_ROLES } from "@/types/user-role";
import { Plus, LayoutDashboard, ShieldCheck, CalendarDays, Building2, Zap } from "lucide-react";
import Logo from "@/components/ui/logo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('halls');
  return { title: t('title') };
}

type DeviceStats = { total: number; available: number; active: number; offline: number };

async function HallsGrid() {
  const t = await getTranslations('halls');
  const supabase = await getServerClient();
  
  // Try to get all halls with stats in ONE database call
  const { data: hallsData, error } = await supabase.rpc('get_all_halls_with_stats');
  
  let halls = hallsData || [];

  // Fallback: fetch data manually if function doesn't exist
  if (error || !hallsData) {
    console.warn('[Halls] Database function not available, using fallback queries');
    
    const hallsList = await getHalls();
    
    if (hallsList.length === 0) {
      halls = [];
    } else {
      // Fetch device stats for all halls
      const { data: devices } = await supabase
        .from("devices")
        .select("hall_id, status")
        .in("hall_id", hallsList.map(h => h.id));

      const statsMap = new Map<string, DeviceStats>();
      for (const d of devices ?? []) {
        const s = statsMap.get(d.hall_id) ?? { total: 0, available: 0, active: 0, offline: 0 };
        s.total++;
        if (d.status === "available") s.available++;
        if (d.status === "active")    s.active++;
        if (d.status === "offline")   s.offline++;
        statsMap.set(d.hall_id, s);
      }

      const empty: DeviceStats = { total: 0, available: 0, active: 0, offline: 0 };
      halls = hallsList.map(hall => ({
        ...hall,
        stats: statsMap.get(hall.id) ?? empty
      }));
    }
  }

  if (halls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
          style={{ background: "oklch(0.55 0.26 280 / 0.1)", border: "1px solid oklch(0.55 0.26 280 / 0.2)" }}>
          <Building2 size={36} style={{ color: "oklch(0.65 0.22 280)" }} />
        </div>
        <p className="text-lg font-semibold text-foreground mb-2">{t('noHallsAvailable')}</p>
        <p className="text-sm text-muted-foreground">{t('checkBackLater')}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {halls.map((hall: any) => (
        <HallCard key={hall.id} hall={hall} stats={hall.stats} />
      ))}
    </div>
  );
}

function HallsGridSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div 
          key={i} 
          className="rounded-2xl border border-border/60 bg-card p-6 space-y-4 animate-pulse"
        >
          {/* Header Skeleton */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div 
                className="w-12 h-12 rounded-xl"
                style={{ background: "oklch(0.55 0.26 280 / 0.1)" }}
              />
              <div className="flex-1 space-y-2">
                <div 
                  className="h-5 rounded w-3/4"
                  style={{ background: "oklch(0.55 0.26 280 / 0.1)" }}
                />
                <div 
                  className="h-3 rounded w-1/2"
                  style={{ background: "oklch(0.55 0.26 280 / 0.08)" }}
                />
              </div>
            </div>
            <div 
              className="w-16 h-7 rounded-full"
              style={{ background: "oklch(0.45 0.20 145 / 0.1)" }}
            />
          </div>

          {/* Total Devices Skeleton */}
          <div 
            className="flex items-center justify-between p-4 rounded-xl"
            style={{ background: "oklch(0.55 0.26 280 / 0.05)" }}
          >
            <div className="space-y-2">
              <div 
                className="h-3 w-20 rounded"
                style={{ background: "oklch(0.55 0.26 280 / 0.1)" }}
              />
              <div 
                className="h-8 w-12 rounded"
                style={{ background: "oklch(0.55 0.26 280 / 0.15)" }}
              />
            </div>
            <div 
              className="w-16 h-16 rounded-xl"
              style={{ background: "oklch(0.55 0.26 280 / 0.15)" }}
            />
          </div>

          {/* Footer Skeleton */}
          <div className="flex items-center justify-end pt-2 border-t border-border/40">
            <div 
              className="h-4 w-24 rounded"
              style={{ background: "oklch(0.55 0.26 280 / 0.1)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function HallsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('nav');
  const th = await getTranslations('halls');
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const [showAdmin, profile] = await Promise.all([
    isSuperAdmin(user.id),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle().then(r => r.data),
  ]);

  const isHallRole = profile?.role && HALL_DASHBOARD_ROLES.includes(profile.role as any);
  let hallDashboardId: string | null = null;
  if (isHallRole) {
    const { data: assignment } = await supabase
      .from("staff_assignments").select("hall_id").eq("user_id", user.id).maybeSingle();
    hallDashboardId = assignment?.hall_id ?? null;
  }

  return (
    <div className="min-h-screen bg-background">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 h-14 flex items-center gap-2">
          <Logo href="/halls" size="sm" showText={true} />

          <div className="flex-1" />

          <nav className="flex items-center gap-1">
            <LanguageToggle />
            {showAdmin && (
              <Link href="/admin"
                className="inline-flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-lg text-xs font-medium border border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors">
                <ShieldCheck size={13} />
                <span className="hidden sm:inline">{t('admin')}</span>
              </Link>
            )}
            {hallDashboardId && (
              <Link href={`/dashboard/${hallDashboardId}`}
                className="inline-flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-lg text-xs font-medium border border-border/60 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <LayoutDashboard size={13} />
                <span className="hidden sm:inline">{t('dashboard')}</span>
              </Link>
            )}
            <Link href="/reservations"
              className="inline-flex items-center gap-1.5 h-8 px-2 sm:px-3 rounded-lg text-xs font-medium border border-border/60 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <CalendarDays size={13} />
              <span className="hidden sm:inline">{t('reservations')}</span>
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-border/40">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, oklch(0.55 0.26 280) 0%, transparent 65%)" }} />
          <div className="absolute top-0 right-0 w-[300px] h-[250px] rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, oklch(0.82 0.14 200) 0%, transparent 70%)" }} />
        </div>

        <div className="relative max-w-6xl mx-auto px-3 sm:px-5 py-10 sm:py-16">
          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="space-y-2 sm:space-y-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
                style={{ background: "oklch(0.55 0.26 280 / 0.1)", borderColor: "oklch(0.55 0.26 280 / 0.25)", color: "oklch(0.75 0.18 280)" }}>
                <Zap size={11} />
                {th('bookYourSession')}
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
                {th('findYourGamingArena')}
              </h1>
              <p className="text-muted-foreground text-sm max-w-md">
                {th('browseHalls')}
              </p>
            </div>

            <Link href="/reservations/new"
              className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] w-full sm:w-auto"
              style={{ background: "linear-gradient(135deg, oklch(0.55 0.26 280), oklch(0.48 0.26 280))", boxShadow: "0 0 20px oklch(0.55 0.26 280 / 0.3)" }}>
              <Plus size={16} />
              {th('newBooking')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Halls Grid ── */}
      <main className="max-w-6xl mx-auto px-3 sm:px-5 py-8 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 sm:mb-6">
          {th('allHalls')}
        </p>
        <Suspense fallback={<HallsGridSkeleton />}>
          <HallsGrid />
        </Suspense>
      </main>
    </div>
  );
}
