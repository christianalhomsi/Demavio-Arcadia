import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { HallTime } from "@/components/domain/HallTime";
import { Skeleton } from "@/components/ui/skeleton";
import { listPlatformAudit } from "@/features/admin/queries";
import { AUDIT_FILTER_KEYS, PLATFORM_AUDIT_FILTERS } from "@/features/admin/schemas";
import { requirePlatformRole } from "@/lib/auth/guards";
import { parseListParams, toRange } from "@/lib/query/searchParams";
import { getT } from "@/lib/i18n/server";
import { tpl } from "@/lib/i18n/messages";

export const metadata = { title: "Platform audit" };

async function Audit({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformRole("super_admin");
  const list = parseListParams(await searchParams, { pageSize: 25 });
  // Only known filter values reach the backend.
  const action = PLATFORM_AUDIT_FILTERS.some((f) => f.value && f.value === list.filters.action)
    ? list.filters.action
    : undefined;
  const [from] = toRange(list);
  const { t } = await getT();
  const result = await listPlatformAudit({ limit: list.pageSize, offset: from, action });
  if (!result) return <ErrorState message={t.auLoadFail} />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t.plAuTitle}</h1>
      <p className="text-sm text-muted">{t.plAuNote}</p>
      <nav aria-label={t.ivFilter} className="flex flex-wrap gap-2 text-sm">
        {PLATFORM_AUDIT_FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.value ? `?action=${encodeURIComponent(f.value)}` : "?"}
            aria-current={(action ?? "") === f.value ? "true" : undefined}
            className="inline-flex min-h-10 items-center rounded-full border border-border px-4 py-1 aria-[current=true]:bg-neutral-bg aria-[current=true]:font-medium"
          >
            {t[AUDIT_FILTER_KEYS[f.value] ?? "auAll"]}
          </Link>
        ))}
      </nav>
      {result.entries.length === 0 ? (
        <EmptyState title={t.auEmpty} />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
          {result.entries.map((e) => (
            <li key={e.id} className="p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{e.action}</span>
                <HallTime value={e.createdAt} timeZone="UTC" />
              </div>
              <div className="text-muted">
                {tpl(t.auBy, { name: e.actorName ?? t.auSystem })}
                {e.reason ? ` · ${tpl(t.auReason, { reason: e.reason })}` : ""}
              </div>
              {(e.before != null || e.after != null) && (
                <details className="mt-1">
                  <summary className="flex min-h-11 cursor-pointer items-center text-xs text-muted">
                    {t.auDetails}
                  </summary>
                  <pre dir="ltr" className="mt-1 overflow-x-auto rounded bg-neutral-bg p-2 text-xs">
                    {JSON.stringify({ before: e.before, after: e.after }, null, 2)}
                  </pre>
                </details>
              )}
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

export default function PlatformAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}
