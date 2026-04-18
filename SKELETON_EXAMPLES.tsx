/**
 * أمثلة على استخدام Skeleton Loaders
 * 
 * هذا الملف للمرجعية فقط - يوضح كيفية استخدام كل نوع من الـ skeletons
 */

// ═══════════════════════════════════════════════════════
// 1. استخدام Page Skeletons الجاهزة
// ═══════════════════════════════════════════════════════

// مثال: صفحة القاعات
// app/(dashboard)/halls/loading.tsx
import { HallsPageSkeleton } from "@/components/ui/page-skeleton";

export default function Loading() {
  return <HallsPageSkeleton />;
}

// مثال: صفحة الإدارة
// app/admin/halls/loading.tsx
import { AdminPageSkeleton } from "@/components/ui/page-skeleton";

export default function Loading() {
  return <AdminPageSkeleton />;
}

// مثال: لوحة التحكم
// app/dashboard/[hallId]/loading.tsx
import { DashboardSkeleton } from "@/components/ui/page-skeleton";

export default function Loading() {
  return <DashboardSkeleton />;
}

// مثال: جدول
// app/reservations/loading.tsx
import { TableSkeleton } from "@/components/ui/page-skeleton";

export default function Loading() {
  return <TableSkeleton rows={10} />;
}

// ═══════════════════════════════════════════════════════
// 2. استخدام Suspense مع Skeleton
// ═══════════════════════════════════════════════════════

import { Suspense } from "react";
import { TableSkeleton } from "@/components/ui/page-skeleton";

export default function Page() {
  return (
    <div className="page-shell">
      <h1>My Page</h1>
      
      <Suspense fallback={<TableSkeleton />}>
        <AsyncDataComponent />
      </Suspense>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 3. إنشاء Skeleton مخصص يطابق التصميم
// ═══════════════════════════════════════════════════════

import { Skeleton } from "@/components/ui/skeleton";
import { Building2 } from "lucide-react";

function CustomCardSkeleton() {
  return (
    <div className="relative rounded-2xl border border-border/50 bg-card overflow-hidden">
      {/* نفس الـ decorative elements من الكومبوننت الأصلي */}
      <div className="absolute inset-x-0 top-0 h-px"
        style={{ 
          background: "linear-gradient(90deg, transparent, oklch(0.55 0.26 280 / 0.6), oklch(0.82 0.14 200 / 0.3), transparent)" 
        }} />
      
      <div className="p-5 space-y-4">
        {/* Header مع icon أصلي */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ 
                background: "oklch(0.55 0.26 280 / 0.12)", 
                border: "1px solid oklch(0.55 0.26 280 / 0.22)" 
              }}>
              <Building2 size={20} style={{ color: "oklch(0.65 0.22 280)" }} />
            </div>
            <Skeleton className="w-32 h-5" />
          </div>
          <Skeleton className="w-16 h-6 rounded-full" />
        </div>
        
        {/* Content */}
        <div className="space-y-2">
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-3/4 h-4" />
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border/30">
          <Skeleton className="w-20 h-3" />
          <Skeleton className="w-24 h-3" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 4. استخدام useQueryLoading Hook
// ═══════════════════════════════════════════════════════

"use client";

import { useQueryLoading } from "@/hooks";
import { Skeleton } from "@/components/ui/skeleton";

function MyComponent() {
  const isLoading = useQueryLoading();
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  
  return <YourContent />;
}

// ═══════════════════════════════════════════════════════
// 5. Skeleton لـ List Items
// ═══════════════════════════════════════════════════════

function ListSkeleton() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div 
          key={i} 
          className={`flex items-center gap-4 px-5 py-4 ${i !== 0 ? "border-t border-border/30" : ""}`}
        >
          {/* Icon container */}
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ 
              background: "oklch(0.55 0.26 280 / 0.1)", 
              border: "1px solid oklch(0.55 0.26 280 / 0.2)" 
            }}>
            <Skeleton className="w-5 h-5" />
          </div>
          
          {/* Content */}
          <div className="flex-1 space-y-2">
            <Skeleton className="w-48 h-4" />
            <Skeleton className="w-64 h-3" />
          </div>
          
          {/* Actions */}
          <Skeleton className="w-16 h-8 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 6. Skeleton لـ Stats Cards
// ═══════════════════════════════════════════════════════

function StatsCardsSkeleton() {
  return (
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
  );
}

// ═══════════════════════════════════════════════════════
// نصائح مهمة:
// ═══════════════════════════════════════════════════════

/**
 * ✅ افعل:
 * - استخدم نفس الـ structure من الكومبوننت الأصلي
 * - حافظ على الألوان والـ borders
 * - استخدم الـ icons الأصلية في الـ skeleton
 * - استخدم skeleton-shimmer class للتأثير المتحرك
 * 
 * ❌ لا تفعل:
 * - لا تستخدم skeleton بسيط لكومبوننت معقد
 * - لا تغير الألوان أو التصميم
 * - لا تنسى الـ decorative elements
 */
