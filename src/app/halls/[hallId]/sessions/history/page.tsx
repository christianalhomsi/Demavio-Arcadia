import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { HallTime } from "@/components/domain/HallTime";
import { permissionForPath } from "@/components/shell/nav";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getHallTimeZone } from "@/features/halls/queries";
import { listSessions } from "@/features/sessions/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { formatDuration } from "@/lib/dates";
import { parseListParams, toRange } from "@/lib/query/searchParams";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Session history" };

async function History({
  params,
  searchParams,
}: {
  params: Promise<{ hallId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/sessions"));
  const list = parseListParams(await searchParams, { pageSize: 25 });
  const [from] = toRange(list);
  const { t } = await getT();
  const [result, tz] = await Promise.all([
    listSessions(hallId, { activeOnly: false, limit: list.pageSize, offset: from }),
    getHallTimeZone(hallId),
  ]);
  if (!result) return <ErrorState message={t.ssHistLoadFail} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.ssHistTitle}</h1>
        <Link className="text-sm underline" href={`/halls/${hallId}/sessions`}>
          {t.ssActive}
        </Link>
      </div>
      {result.rows.length === 0 ? (
        <EmptyState title={t.ssNoSessions} />
      ) : (
        <div className="stack-table overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">{t.ssHistCaption}</caption>
            <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-2">
                  {t.colStarted}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colDevice}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colCustomer}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colType}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colDuration}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colStatus}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <Link className="hover:underline" href={`/halls/${hallId}/sessions/${s.id}`}>
                      <HallTime value={s.startedAt} timeZone={tz} />
                    </Link>
                  </td>
                  <td className="px-4 py-2">{s.deviceName}</td>
                  <td className="px-4 py-2">{s.customerName ?? "—"}</td>
                  <td className="px-4 py-2">{s.type === "open" ? t.ssOpen : t.ssFixed}</td>
                  <td className="px-4 py-2 tabular-nums">
                    {s.billableSeconds === null
                      ? t.ssRunning
                      : formatDuration(s.billableSeconds * 1000)}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={s.endedAt ? "neutral" : "success"}>
                      {s.endedAt
                        ? s.status === "interrupted"
                          ? t.ssInterrupted
                          : t.ssCompleted
                        : t.ssInProgress}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Suspense fallback={null}>
        <Pagination page={list.page} pageSize={list.pageSize} total={result.total} />
      </Suspense>
    </div>
  );
}

export default function SessionHistoryPage({
  params,
  searchParams,
}: PageProps<"/halls/[hallId]/sessions/history">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <History params={params} searchParams={searchParams} />
    </Suspense>
  );
}
