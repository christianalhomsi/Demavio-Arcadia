import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "oklch(0.82 0.14 200 / 0.12)", border: "1px solid oklch(0.82 0.14 200 / 0.25)" }}>
          <Users size={20} style={{ color: "oklch(0.82 0.14 200)" }} />
        </div>
        <div>
          <Skeleton className="w-24 h-8 mb-1" />
          <Skeleton className="w-80 h-4" />
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="flex-1 h-10 rounded-lg" />
          <Skeleton className="w-32 h-10 rounded-xl" />
        </div>
        
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`flex items-center gap-4 px-5 py-4 ${i !== 0 ? "border-t border-border/30" : ""}`}>
              <div className="w-10 h-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <Skeleton className="w-48 h-4" />
                <Skeleton className="w-64 h-3" />
              </div>
              <Skeleton className="w-20 h-6 rounded-full" />
              <Skeleton className="w-8 h-8 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
