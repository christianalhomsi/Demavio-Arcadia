import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { getHalls } from "@/services/halls";
import { isSuperAdmin } from "@/services/access";
import HallCard from "@/components/ui/hall-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import LogoutButton from "@/components/ui/logout-button";
import { HALL_DASHBOARD_ROLES } from "@/types/user-role";

export const metadata: Metadata = { title: "Halls" };

async function HallsGrid() {
  const halls = await getHalls();

  if (halls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4"
          style={{ background: "oklch(0.55 0.26 280 / 0.1)", border: "1px solid oklch(0.55 0.26 280 / 0.2)" }}>
          🏟
        </div>
        <p className="font-semibold text-foreground mb-1">No halls yet</p>
        <p className="text-sm text-muted-foreground">No halls available at the moment.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {halls.map((hall) => <HallCard key={hall.id} hall={hall} />)}
    </div>
  );
}

function HallsGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-40 rounded-xl skeleton-shimmer" />
      ))}
    </div>
  );
}

export default async function HallsPage() {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const showAdmin = await isSuperAdmin(user.id);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isHallRole = profile?.role && HALL_DASHBOARD_ROLES.includes(profile.role as any);

  let hallDashboardId: string | null = null;
  if (isHallRole) {
    const { data: assignment } = await supabase
      .from("staff_assignments")
      .select("hall_id")
      .eq("user_id", user.id)
      .maybeSingle();
    hallDashboardId = assignment?.hall_id ?? null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* top nav */}
      <header className="flex items-center gap-3 px-5 h-14 border-b border-border/60 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <Link href="/halls" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
            style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.3)" }}>
            🎮
          </div>
          <span className="text-sm font-bold tracking-tight">
            <span style={{ color: "oklch(0.55 0.26 280)" }}>Gaming</span>
            <span style={{ color: "oklch(0.82 0.14 200)" }}>Hub</span>
          </span>
        </Link>
        <Separator orientation="vertical" className="h-5 opacity-30" />
        <span className="text-sm font-medium text-foreground">Halls</span>
        <div className="flex-1" />
        {showAdmin ? (
          <Link
            href="/admin"
            className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg text-xs font-medium border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/15 transition-colors"
          >
            Admin
          </Link>
        ) : null}
        {hallDashboardId ? (
          <Link
            href={`/dashboard/${hallDashboardId}`}
            className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-muted transition-colors"
          >
            Dashboard
          </Link>
        ) : null}
        <Link href="/reservations" className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-muted transition-colors">
          My Reservations
        </Link>
        <LogoutButton />
      </header>

      <div className="page-shell">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gaming Halls</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Select a hall to view and book devices</p>
          </div>
          <Link href="/reservations/new" className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg text-xs font-medium text-white transition-colors" style={{ background: "oklch(0.55 0.26 280)" }}>
            + New Booking
          </Link>
        </div>

        <Separator className="opacity-40" />

        <Suspense fallback={<HallsGridSkeleton />}>
          <HallsGrid />
        </Suspense>
      </div>
    </div>
  );
}
