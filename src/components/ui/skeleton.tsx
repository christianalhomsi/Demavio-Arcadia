import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-neutral-bg", className)} />;
}

/*
 * Page-shaped skeletons. Each mirrors the real markup of the content it stands in for
 * (same container, border, radius, paddings and row heights) so nothing jumps on load.
 */

const CARD = "rounded-2xl border border-border bg-surface shadow-card";

/** `<h1 text-2xl>` (32px line) with an optional subtitle and an optional action button. */
export function HeaderSkeleton({
  action = false,
  subtitle = false,
}: {
  action?: boolean;
  subtitle?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-8 w-44" />
        {subtitle && <Skeleton className="mt-2 h-4 w-72 max-w-full" />}
      </div>
      {action && <Skeleton className="h-11 w-28 rounded-xl" />}
    </div>
  );
}

/** Row of pill filters (status / period tabs). */
export function FiltersSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-8 w-20 rounded-full" />
      ))}
    </div>
  );
}

/** Search box + submit button, as in the admin list pages. */
export function SearchSkeleton() {
  return (
    <div className="flex gap-2">
      <Skeleton className="h-11 flex-1 rounded-xl" />
      <Skeleton className="h-11 w-24 rounded-xl" />
    </div>
  );
}

/** Bordered table: header strip + rows. */
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div aria-hidden className={cn(CARD, "overflow-hidden")}>
      <div className="flex gap-4 border-b border-border bg-neutral-bg px-4 py-3">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} className="h-3 flex-1 bg-border/60" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0"
        >
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cn("h-4 flex-1", c === 0 && "max-w-[40%]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** `divide-y` list card with a two-line row and a trailing badge. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden className={cn(CARD, "divide-y divide-border")}>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

/** Grid of cards (device / session boards). */
export function CardGridSkeleton({
  count = 6,
  className = "sm:grid-cols-2 xl:grid-cols-3",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <ul aria-hidden className={cn("grid gap-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={cn(CARD, "space-y-3 p-4")}>
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </li>
      ))}
    </ul>
  );
}

/** KPI tiles: label + 3xl number. */
export function KpiGridSkeleton({
  count = 4,
  className = "grid-cols-2 lg:grid-cols-4",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("grid gap-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn(CARD, "p-4")}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-9 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Key/value grid (`<dl className="grid sm:grid-cols-2">`) inside cards. */
export function DetailGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn(CARD, "p-4")}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-5 w-32" />
        </div>
      ))}
    </div>
  );
}

/** Labelled inputs + submit button. */
export function FormSkeleton({ fields = 4, className }: { fields?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("space-y-4", className)}>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      ))}
      <Skeleton className="h-11 w-32 rounded-xl" />
    </div>
  );
}

/** Centered section card with a title row (used by settings / dashboard sections). */
export function SectionSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden className={cn(CARD, "space-y-3 p-4")}>
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i % 2 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

function PaginationSkeleton() {
  return (
    <div aria-hidden className="flex items-center justify-between">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-40 rounded-xl" />
    </div>
  );
}

/* ---- Page-level presets (one per content shape) ---- */

/** Header (+ action) → table → optional pagination. */
export function TablePageSkeleton({
  action = true,
  subtitle = false,
  search = false,
  filters = 0,
  rows = 8,
  cols = 5,
  pagination = false,
}: {
  action?: boolean;
  subtitle?: boolean;
  search?: boolean;
  filters?: number;
  rows?: number;
  cols?: number;
  pagination?: boolean;
}) {
  return (
    <div aria-hidden className="space-y-4">
      <HeaderSkeleton action={action} subtitle={subtitle} />
      {search && <SearchSkeleton />}
      {filters > 0 && <FiltersSkeleton count={filters} />}
      <TableSkeleton rows={rows} cols={cols} />
      {pagination && <PaginationSkeleton />}
    </div>
  );
}

/** Header (+ action) → divided list → optional pagination. */
export function ListPageSkeleton({
  action = false,
  subtitle = false,
  search = false,
  filters = 0,
  rows = 8,
  pagination = false,
}: {
  action?: boolean;
  subtitle?: boolean;
  search?: boolean;
  filters?: number;
  rows?: number;
  pagination?: boolean;
}) {
  return (
    <div aria-hidden className="space-y-4">
      <HeaderSkeleton action={action} subtitle={subtitle} />
      {search && <SearchSkeleton />}
      {filters > 0 && <FiltersSkeleton count={filters} />}
      <ListSkeleton rows={rows} />
      {pagination && <PaginationSkeleton />}
    </div>
  );
}

/** Header (+ action) → card grid. */
export function CardsPageSkeleton({
  action = true,
  count = 6,
}: {
  action?: boolean;
  count?: number;
}) {
  return (
    <div aria-hidden className="space-y-4">
      <HeaderSkeleton action={action} />
      <CardGridSkeleton count={count} />
    </div>
  );
}

/** Header → KPI tiles → list. */
export function DashboardPageSkeleton({
  kpis = 4,
  kpiClassName,
  rows = 5,
}: {
  kpis?: number;
  kpiClassName?: string;
  rows?: number;
}) {
  return (
    <div aria-hidden className="space-y-6">
      <HeaderSkeleton subtitle />
      <KpiGridSkeleton count={kpis} className={kpiClassName} />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <ListSkeleton rows={rows} />
      </div>
    </div>
  );
}

/** Header → key/value grid → optional list/table section. */
export function DetailPageSkeleton({
  fields = 6,
  section = "list",
}: {
  fields?: number;
  section?: "list" | "table" | "none";
}) {
  return (
    <div aria-hidden className="space-y-4">
      <HeaderSkeleton action />
      <DetailGridSkeleton count={fields} />
      {section === "list" && <ListSkeleton rows={4} />}
      {section === "table" && <TableSkeleton rows={4} cols={4} />}
    </div>
  );
}

/** Header → form. */
export function FormPageSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div aria-hidden className="space-y-4">
      <HeaderSkeleton />
      <div className={cn(CARD, "p-4")}>
        <FormSkeleton fields={fields} />
      </div>
    </div>
  );
}

/** Header → several settings sections. */
export function SectionsPageSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div aria-hidden className="space-y-6">
      <HeaderSkeleton />
      {Array.from({ length: sections }, (_, i) => (
        <SectionSkeleton key={i} lines={3} />
      ))}
    </div>
  );
}
