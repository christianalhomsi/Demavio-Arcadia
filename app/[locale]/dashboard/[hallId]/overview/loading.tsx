import { DashboardSkeleton } from "@/components/ui/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutDashboard } from "lucide-react";

export default function Loading() {
  return (
    <div className="page-shell">
      <div className="flex items-center gap-2.5">
        <LayoutDashboard size={18} className="text-muted-foreground" />
        <div>
          <Skeleton className="w-24 h-6 mb-1" />
          <Skeleton className="w-40 h-4" />
        </div>
      </div>
      <DashboardSkeleton />
    </div>
  );
}
