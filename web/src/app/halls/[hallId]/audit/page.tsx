import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { HallTime } from "@/components/domain/HallTime";
import { permissionForPath } from "@/components/shell/nav";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { auditLabel } from "@/features/audit/labels";
import { listHallAudit } from "@/features/audit/queries";
import { getHallTimeZone } from "@/features/halls/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { parseListParams, toRange } from "@/lib/query/searchParams";
import { getT } from "@/lib/i18n/server";
import { tpl, type Messages } from "@/lib/i18n/messages";

export const metadata = { title: "Audit log" };

const FILTERS: { value: string; label: keyof Messages }[] = [
  { value: "", label: "auAll" },
  { value: "hall.", label: "auHall" },
  { value: "employee.", label: "navEmployees" },
];

async function Audit({
  params,
  searchParams,
}: {
  params: Promise<{ hallId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/audit"));

  const list = parseListParams(await searchParams, { pageSize: 25 });
  // Only known filter values reach the backend.
  const action = FILTERS.some((f) => f.value && f.value === list.filters.action)
    ? list.filters.action
    : undefined;
  const [from] = toRange(list);

  const { t, locale } = await getT();
  const [result, timeZone] = await Promise.all([
    listHallAudit(hallId, { limit: list.pageSize, offset: from, action }),
    getHallTimeZone(hallId),
  ]);
  if (!result) return <ErrorState message={t.auLoadFail} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t.auTitle}</h1>
        <nav aria-label={t.ivFilter} className="flex gap-2 text-sm">
          {FILTERS.map((f) => (
            <Link
              key={f.label}
              href={f.value ? `?action=${encodeURIComponent(f.value)}` : "?"}
              aria-current={(action ?? "") === f.value ? "true" : undefined}
              className="inline-flex min-h-10 items-center rounded-full border border-border px-4 py-1 aria-[current=true]:bg-neutral-bg aria-[current=true]:font-medium"
            >
              {t[f.label]}
            </Link>
          ))}
        </nav>
      </div>

      {result.entries.length === 0 ? (
        <EmptyState title={t.auEmpty} description={t.auEmptyDesc} />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
          {result.entries.map((e) => (
            <li key={e.id} className="p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{auditLabel(e.action, locale) ?? e.action}</span>
                <HallTime value={e.createdAt} timeZone={timeZone} />
              </div>
              <div className="text-muted">
                {tpl(t.auBy, { name: e.actorName ?? t.auSystem })}
                {e.reason ? ` · ${tpl(t.auReason, { reason: e.reason })}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Suspense fallback={null}>
        <Pagination page={list.page} pageSize={list.pageSize} total={result.total} />
      </Suspense>
    </div>
  );
}

export default function AuditPage({ params, searchParams }: PageProps<"/halls/[hallId]/audit">) {
  return (
    <Suspense fallback={<ListPageSkeleton filters={3} pagination />}>
      <Audit params={params} searchParams={searchParams} />
    </Suspense>
  );
}
