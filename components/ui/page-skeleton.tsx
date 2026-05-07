import { Skeleton } from "./skeleton";
import { Building2, MapPin } from "lucide-react";

// Skeleton لبطاقة القاعة - يطابق HallCard الجديد
function HallCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4 animate-pulse">
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
  );
}

export function HallsPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 h-12 sm:h-14 flex items-center gap-2 sm:gap-3">
          <Skeleton className="w-24 sm:w-32 h-7 sm:h-8 rounded-xl" />
          <div className="flex-1" />
          <div className="flex items-center gap-1 sm:gap-1.5">
            <Skeleton className="w-16 sm:w-20 h-7 sm:h-8 rounded-lg" />
            <Skeleton className="w-20 sm:w-24 h-7 sm:h-8 rounded-lg" />
            <Skeleton className="w-24 sm:w-28 h-7 sm:h-8 rounded-lg" />
            <Skeleton className="w-7 sm:w-8 h-7 sm:h-8 rounded-lg" />
          </div>
        </div>
      </header>
      <section className="border-b border-border/40">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 py-10 sm:py-16">
          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="space-y-2 sm:space-y-3">
              <Skeleton className="w-24 sm:w-32 h-5 sm:h-6 rounded-full" />
              <Skeleton className="w-64 sm:w-80 h-8 sm:h-10 rounded-lg" />
              <Skeleton className="w-72 sm:w-96 h-4 sm:h-5 rounded-lg" />
            </div>
            <Skeleton className="w-full sm:w-36 h-9 sm:h-10 rounded-xl" />
          </div>
        </div>
      </section>
      <main className="max-w-6xl mx-auto px-3 sm:px-5 py-6 sm:py-10">
        <Skeleton className="w-16 sm:w-20 h-3 sm:h-4 mb-4 sm:mb-6" />
        <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
    <div className="space-y-4 sm:space-y-6">
      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="space-y-1.5 sm:space-y-2">
          <Skeleton className="w-24 sm:w-32 h-6 sm:h-8" />
          <Skeleton className="w-48 sm:w-64 h-3 sm:h-4" />
        </div>
        <Skeleton className="w-full sm:w-28 h-8 sm:h-9 rounded-xl" />
      </div>

      {/* list */}
      <div className="rounded-xl sm:rounded-2xl border border-border/50 bg-card overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 ${i !== 0 ? "border-t border-border/30" : ""}`}>
            {/* icon */}
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "oklch(0.55 0.26 280 / 0.1)", border: "1px solid oklch(0.55 0.26 280 / 0.2)" }}>
              <Skeleton className="w-4 h-4 sm:w-5 sm:h-5" style={{ background: "oklch(0.65 0.22 280 / 0.3)" }} />
            </div>

            {/* info */}
            <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2">
              <Skeleton className="w-36 sm:w-48 h-3.5 sm:h-4" />
              <div className="flex items-center gap-1">
                <Skeleton className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full" />
                <Skeleton className="w-48 sm:w-64 h-2.5 sm:h-3" />
              </div>
            </div>

            {/* device count */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <Skeleton className="w-3 h-3" />
              <Skeleton className="w-12 h-3" />
            </div>

            {/* actions */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <Skeleton className="w-14 sm:w-16 h-7 sm:h-8 rounded-lg" />
              <Skeleton className="w-20 sm:w-24 h-7 sm:h-8 rounded-lg" />
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
      <div className="grid gap-2.5 sm:gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg sm:rounded-xl border border-border/60 bg-card">
            <div className="pt-3 pb-3 px-4 sm:pt-4 sm:pb-4 sm:px-6">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <Skeleton className="w-12 sm:w-16 h-2.5 sm:h-3" />
                <Skeleton className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded" />
              </div>
              <Skeleton className="w-10 sm:w-12 h-7 sm:h-9" />
            </div>
          </div>
        ))}
      </div>

      {/* recent reservations table */}
      <div className="rounded-lg sm:rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-border/40">
          <Skeleton className="w-32 sm:w-40 h-4 sm:h-5" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border/40">
                {Array.from({ length: 4 }).map((_, i) => (
                  <th key={i} className="px-3 py-2 sm:px-4 sm:py-2.5 text-left">
                    <Skeleton className="w-12 sm:w-16 h-2.5 sm:h-3" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-border/20 last:border-0">
                  <td className="px-3 py-2.5 sm:px-4 sm:py-3"><Skeleton className="w-20 sm:w-24 h-3.5 sm:h-4" /></td>
                  <td className="px-3 py-2.5 sm:px-4 sm:py-3"><Skeleton className="w-24 sm:w-32 h-2.5 sm:h-3" /></td>
                  <td className="px-3 py-2.5 sm:px-4 sm:py-3"><Skeleton className="w-24 sm:w-32 h-2.5 sm:h-3" /></td>
                  <td className="px-3 py-2.5 sm:px-4 sm:py-3"><Skeleton className="w-14 sm:w-16 h-4 sm:h-5 rounded-full" /></td>
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
    <div className="rounded-lg sm:rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              {["Hall", "Device", "Start", "End", "Status"].map((h) => (
                <th key={h} className="px-3 py-2.5 sm:px-4 sm:py-3 text-left">
                  <Skeleton className="w-12 sm:w-16 h-2.5 sm:h-3" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="border-b border-border/20 last:border-0">
                <td className="px-3 py-2.5 sm:px-4 sm:py-3"><Skeleton className="w-20 sm:w-24 h-3.5 sm:h-4" /></td>
                <td className="px-3 py-2.5 sm:px-4 sm:py-3"><Skeleton className="w-16 sm:w-20 h-2.5 sm:h-3" /></td>
                <td className="px-3 py-2.5 sm:px-4 sm:py-3"><Skeleton className="w-24 sm:w-32 h-2.5 sm:h-3" /></td>
                <td className="px-3 py-2.5 sm:px-4 sm:py-3"><Skeleton className="w-24 sm:w-32 h-2.5 sm:h-3" /></td>
                <td className="px-3 py-2.5 sm:px-4 sm:py-3"><Skeleton className="w-14 sm:w-16 h-4 sm:h-5 rounded-full" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
