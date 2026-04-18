import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/page-skeleton";
import { Gamepad2, ChevronRight, CalendarDays, Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-5 h-14 border-b border-border/60 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-2 group shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.3)" }}
          >
            <Gamepad2 size={15} style={{ color: "oklch(0.65 0.22 280)" }} />
          </div>
          <span className="text-sm font-bold tracking-tight hidden sm:block">
            <span style={{ color: "oklch(0.55 0.26 280)" }}>Arc</span>
            <span style={{ color: "oklch(0.82 0.14 200)" }}>adia</span>
          </span>
        </div>
        <Separator orientation="vertical" className="h-5 opacity-30" />
        <nav className="flex items-center gap-1 text-sm">
          <Skeleton className="w-12 h-4" />
          <ChevronRight size={13} className="text-border" />
          <Skeleton className="w-28 h-4" />
        </nav>
        <div className="flex-1" />
        <Skeleton className="w-16 h-7 rounded-lg" />
      </header>

      <div className="page-shell">
        <div className="flex items-center gap-2.5">
          <CalendarDays size={18} className="text-muted-foreground" />
          <div>
            <Skeleton className="w-48 h-8 mb-1" />
            <Skeleton className="w-40 h-4" />
          </div>
        </div>
        <Separator className="opacity-40" />
        <TableSkeleton rows={8} />
      </div>
    </div>
  );
}
