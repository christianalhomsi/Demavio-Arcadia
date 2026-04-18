# Skeleton Loaders - دليل الاستخدام

## نظرة عامة
تم إضافة نظام skeleton loaders شامل يطابق تماماً تصميم الكومبوننتس الأصلية ويظهر أثناء:
- التنقل بين الصفحات
- تحميل البيانات من الـ API
- تنفيذ queries من React Query

## المكونات المتاحة

### 1. Page Skeletons
موجودة في: `components/ui/page-skeleton.tsx`

#### HallsPageSkeleton
يطابق تماماً تصميم صفحة القاعات مع:
- Header بالـ navigation
- Hero section
- Grid من HallCard skeletons
- كل card يحتوي على نفس العناصر: icon, badge, progress bar, stats

#### AdminPageSkeleton
يطابق تصميم صفحات الإدارة مع:
- Header مع title و description
- List items مع icons ملونة
- Action buttons

#### DashboardSkeleton
يطابق تصميم لوحة التحكم مع:
- Stats cards (5 cards)
- Recent reservations table

#### TableSkeleton
يطابق تصميم الجداول مع:
- Table headers
- Rows مع columns
- Badge skeletons للـ status

```tsx
import { 
  HallsPageSkeleton,
  AdminPageSkeleton,
  DashboardSkeleton,
  TableSkeleton 
} from "@/components/ui/page-skeleton";

// استخدام في loading.tsx
export default function Loading() {
  return <HallsPageSkeleton />;
}
```

### 2. Navigation Loader
يظهر تلقائياً عند التنقل بين الصفحات مع:
- Logo متحرك مع glow effect
- Loading bar بـ gradient
- نص "Loading..."
- موجود في: `components/navigation-loader.tsx`
- مضاف تلقائياً في `app/layout.tsx`

### 3. Query Loading Bar
شريط تحميل في أعلى الصفحة يظهر أثناء تنفيذ queries
- موجود في: `components/query-loading-bar.tsx`
- مضاف تلقائياً في `app/layout.tsx`
- يستخدم gradient من ألوان البراند

### 4. Basic Skeleton
للاستخدام المخصص:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

<Skeleton className="h-10 w-full" />
<Skeleton className="h-4 w-32 skeleton-shimmer" />
```

## إضافة Skeleton لصفحة جديدة

### الطريقة 1: استخدام loading.tsx (موصى بها)
```tsx
// app/your-route/loading.tsx
import { HallsPageSkeleton } from "@/components/ui/page-skeleton";

export default function Loading() {
  return <HallsPageSkeleton />;
}
```

### الطريقة 2: استخدام Suspense
```tsx
import { Suspense } from "react";
import { TableSkeleton } from "@/components/ui/page-skeleton";

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <YourComponent />
    </Suspense>
  );
}
```

## إنشاء Skeleton مخصص يطابق التصميم

### نصائح لإنشاء skeleton مطابق:

1. **استخدم نفس الـ structure**
```tsx
// إذا كان الكومبوننت الأصلي:
<div className="flex items-center gap-4">
  <div className="w-10 h-10 rounded-xl bg-primary/10">
    <Icon />
  </div>
  <div>
    <h3>{title}</h3>
    <p>{description}</p>
  </div>
</div>

// الـ skeleton يكون:
<div className="flex items-center gap-4">
  <div className="w-10 h-10 rounded-xl bg-primary/10">
    <Skeleton className="w-5 h-5" />
  </div>
  <div>
    <Skeleton className="w-32 h-5 mb-1" />
    <Skeleton className="w-48 h-4" />
  </div>
</div>
```

2. **حافظ على الألوان والـ borders**
```tsx
// استخدم نفس الألوان للـ containers
<div className="rounded-2xl border border-border/50 bg-card">
  {/* skeleton content */}
</div>
```

3. **استخدم الـ icons الأصلية**
```tsx
import { Monitor } from "lucide-react";

<div className="w-12 h-12 rounded-xl" 
  style={{ background: "oklch(0.55 0.26 280 / 0.12)" }}>
  <Monitor size={22} style={{ color: "oklch(0.65 0.22 280)" }} />
</div>
```

### مثال كامل:
```tsx
export function CustomCardSkeleton() {
  return (
    <div className="relative rounded-2xl border border-border/50 bg-card overflow-hidden">
      {/* نفس الـ decorative elements */}
      <div className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(...)" }} />
      
      <div className="p-5 space-y-4">
        {/* Header مع icon أصلي */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl"
            style={{ background: "oklch(0.55 0.26 280 / 0.12)" }}>
            <YourIcon size={20} />
          </div>
          <Skeleton className="flex-1 h-5" />
        </div>
        
        {/* Content */}
        <div className="space-y-2">
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-3/4 h-4" />
        </div>
      </div>
    </div>
  );
}
```

## CSS Classes المتاحة

- `.skeleton-shimmer` - تأثير shimmer متحرك
- `animate-pulse` - تأثير pulse من Tailwind

## Hook للتحقق من حالة التحميل

```tsx
import { useQueryLoading } from "@/hooks";

function MyComponent() {
  const isLoading = useQueryLoading();
  
  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }
  
  return <YourContent />;
}
```

## الصفحات التي تم إضافة Skeleton لها

✅ `/halls` - HallsPageSkeleton (مع HallCard skeletons مطابقة)
✅ `/admin` - DashboardSkeleton
✅ `/admin/halls` - AdminPageSkeleton
✅ `/admin/users` - Custom skeleton مع Users icon
✅ `/reservations` - Full page skeleton مع TableSkeleton
✅ `/dashboard/[hallId]` - DashboardSkeleton مع stats cards

## مميزات النظام

✨ **تطابق تام مع التصميم**
- كل skeleton يحافظ على نفس structure الكومبوننت الأصلي
- الألوان والـ borders مطابقة
- الـ icons الأصلية موجودة في الـ skeleton

🎨 **تأثيرات بصرية**
- Shimmer animation للـ skeletons
- Gradient loading bar
- Glow effects للـ navigation loader
- Pulse animations

⚡ **أداء محسّن**
- تحميل سلس بين الصفحات
- لا يوجد flash of unstyled content
- تجربة مستخدم سلسة

## ملاحظات

- جميع الـ skeletons تستخدم نفس نظام الألوان من التصميم
- التأثيرات متوافقة مع الـ dark mode
- الـ animations محسّنة للأداء
- يمكن تخصيص أي skeleton حسب الحاجة
- الـ skeletons تعمل تلقائياً مع Next.js loading.tsx
- تدعم React Query و Suspense
