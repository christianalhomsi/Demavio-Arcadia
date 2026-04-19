import { Skeleton } from "./skeleton";
import { Gamepad2, MapPin, Wifi } from "lucide-react";

// Skeleton لبطاقة القاعة - يطابق HallCard الجديد
function HallCardSkeleton() {
  return (
    <div className="relative rounded-2xl bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 p-[1px] overflow-hidden">
      <div className="relative rounded-2xl bg-slate-950 p-6 space-y-5">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center border border-purple-500/30">
              <Gamepad2 size={24} className="text-purple-400 opacity-50" />
            </div>
            <div className="space-y-2">
              <Skeleton className="w-32 h-5 bg-slate-800" />
              <div className="flex items-center gap-1">
                <MapPin size={10} className="text-slate-600" />
                <Skeleton className="w-24 h-3 bg-slate-800" />
              </div>
            </div>
          </div>
          
          <Skeleton className="w-16 h-7 rounded-full bg-slate-800" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-900/50 rounded-lg p-3 border border-slate-800">
              <Skeleton className="w-8 h-7 mb-2 bg-slate-800" />
              <Skeleton className="w-12 h-3 bg-slate-800" />
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="w-16 h-3 bg-slate-800" />
            <Skeleton className="w-12 h-3 bg-slate-800" />
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <Skeleton className="h-full w-2/3 bg-gradient-to-r from-purple-500/50 to-blue-500/50" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <div className="flex items-center gap-1.5">
            <Wifi size={12} className="text-slate-600" />
            <Skeleton className="w-16 h-3 bg-slate-800" />
          </div>
          <Skeleton className="w-20 h-4 bg-slate-800" />
        </div>
      </div>
    </div>
  );
}

export function HallsPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center gap-3">
          <Skeleton className="w-32 h-8 rounded-xl" />
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="w-20 h-8 rounded-lg" />
            <Skeleton className="w-24 h-8 rounded-lg" />
            <Skeleton className="w-28 h-8 rounded-lg" />
            <Skeleton className="w-8 h-8 rounded-lg" />
          </div>
        </div>
      </header>
      <section className="border-b border-border/40">
        <div className="max-w-6xl mx-auto px-5 py-16 sm:py-20">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="space-y-3">
              <Skeleton className="w-32 h-6 rounded-full" />
              <Skeleton className="w-80 h-10 rounded-lg" />
              <Skeleton className="w-96 h-5 rounded-lg" />
            </div>
            <Skeleton className="w-36 h-10 rounded-xl" />
          </div>
        </div>
      </section>
      <main className="max-w-6xl mx-auto px-5 py-10">
        <Skeleton className="w-20 h-4 mb-6" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <HallCardSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}

export function AdminPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <Skeleton className="w-32 h-8 mb-2" />
          <Skeleton className="w-64 h-4" />
        </div>
        <Skeleton className="w-28 h-9 rounded-xl" />
      </div>

      {/* list */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`flex items-center gap-4 px-5 py-4 ${i !== 0 ? "border-t border-border/30" : ""}`}>
            {/* icon */}
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "oklch(0.55 0.26 280 / 0.1)", border: "1px solid oklch(0.55 0.26 280 / 0.2)" }}>
              <Skeleton className="w-5 h-5" style={{ background: "oklch(0.65 0.22 280 / 0.3)" }} />
            </div>

            {/* info */}
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="w-48 h-4" />
              <div className="flex items-center gap-1">
                <Skeleton className="w-2.5 h-2.5 rounded-full" />
                <Skeleton className="w-64 h-3" />
              </div>
            </div>

            {/* device count */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <Skeleton className="w-3 h-3" />
              <Skeleton className="w-12 h-3" />
            </div>

            {/* actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Skeleton className="w-16 h-8 rounded-lg" />
              <Skeleton className="w-24 h-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <>
      {/* stats cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/60 bg-card">
            <div className="pt-4 pb-4 px-6">
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="w-16 h-3" />
                <Skeleton className="w-3.5 h-3.5 rounded" />
              </div>
              <Skeleton className="w-12 h-9" />
            </div>
          </div>
        ))}
      </div>

      {/* recent reservations table */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/40">
          <Skeleton className="w-40 h-5" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                {Array.from({ length: 4 }).map((_, i) => (
                  <th key={i} className="px-4 py-2.5 text-left">
                    <Skeleton className="w-16 h-3" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-border/20 last:border-0">
                  <td className="px-4 py-3"><Skeleton className="w-24 h-4" /></td>
                  <td className="px-4 py-3"><Skeleton className="w-32 h-3" /></td>
                  <td className="px-4 py-3"><Skeleton className="w-32 h-3" /></td>
                  <td className="px-4 py-3"><Skeleton className="w-16 h-5 rounded-full" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              {["Hall", "Device", "Start", "End", "Status"].map((h) => (
                <th key={h} className="px-4 py-3 text-left">
                  <Skeleton className="w-16 h-3" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="border-b border-border/20 last:border-0">
                <td className="px-4 py-3"><Skeleton className="w-24 h-4" /></td>
                <td className="px-4 py-3"><Skeleton className="w-20 h-3" /></td>
                <td className="px-4 py-3"><Skeleton className="w-32 h-3" /></td>
                <td className="px-4 py-3"><Skeleton className="w-32 h-3" /></td>
                <td className="px-4 py-3"><Skeleton className="w-16 h-5 rounded-full" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
