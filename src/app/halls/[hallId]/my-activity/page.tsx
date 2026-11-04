import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { HallTime } from "@/components/domain/HallTime";
import { Skeleton } from "@/components/ui/skeleton";
import { listMyActivity } from "@/features/audit/myActivity";
import { getHallTimeZone } from "@/features/halls/queries";
import { requireHallMembership } from "@/lib/auth/guards";
import { parseListParams, toRange } from "@/lib/query/searchParams";
import { getT } from "@/lib/i18n/server";
import { tpl } from "@/lib/i18n/messages";

export const metadata = { title: "My activity" };

async function MyActivity({
  params,
  searchParams,
}: {
  params: Promise<{ hallId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hallId } = await params;
  // Any active member may open this page: it only ever shows their own entries.
  await requireHallMembership(hallId);
  const list = parseListParams(await searchParams, { pageSize: 25 });
  const [from] = toRange(list);
  const { t } = await getT();
  const [result, tz] = await Promise.all([
    listMyActivity(hallId, { limit: list.pageSize, offset: from }),
    getHallTimeZone(hallId),
  ]);
  if (!result) return <ErrorState message={t.maLoadFail} />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t.maTitle}</h1>
      <p className="text-sm text-muted">{t.maIntro}</p>
      {result.entries.length === 0 ? (
        <EmptyState title={t.maEmpty} description={t.maEmptyDesc} />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
          {result.entries.map((e) => (
            <li key={e.id} className="p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{e.action}</span>
                <HallTime value={e.createdAt} timeZone={tz} />
              </div>
              {e.reason && (
                <div className="text-muted">{tpl(t.auReason, { reason: e.reason })}</div>
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

export default function MyActivityPage({
  params,
  searchParams,
}: PageProps<"/halls/[hallId]/my-activity">) {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <MyActivity params={params} searchParams={searchParams} />
    </Suspense>
  );
}
