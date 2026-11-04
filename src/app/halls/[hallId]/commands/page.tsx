import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { HallTime } from "@/components/domain/HallTime";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { permissionForPath } from "@/components/shell/nav";
import { Skeleton } from "@/components/ui/skeleton";
import { listCommandEvents, listCommands } from "@/features/devices/queries";
import { getHallTimeZone } from "@/features/halls/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { parseListParams, toRange } from "@/lib/query/searchParams";
import { LiveRefresh } from "@/lib/realtime/LiveRefresh";
import { getT } from "@/lib/i18n/server";
import { tpl, type Messages } from "@/lib/i18n/messages";
import { COMMAND_KEYS, type StaffCommand } from "@/features/devices/schemas";

export const metadata = { title: "Commands" };

const STATUSES = ["Queued", "Sent", "Acknowledged", "Executed", "Failed", "TimedOut", "Canceled"];
/** Dictionary key per status filter / timeline label. */
const STATUS_KEY: Record<string, keyof Messages> = {
  Queued: "sbQueued",
  Sent: "sbSent",
  Acknowledged: "sbAcknowledged",
  Executed: "sbExecuted",
  Failed: "sbFailed",
  TimedOut: "sbTimedOut",
  Canceled: "sbCanceled",
};

async function Commands({
  params,
  searchParams,
}: {
  params: Promise<{ hallId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/commands"));

  const list = parseListParams(await searchParams, { pageSize: 25 });
  const status = STATUSES.includes(list.filters.status ?? "") ? list.filters.status : undefined;
  const [from] = toRange(list);

  const { t } = await getT();
  const [result, tz] = await Promise.all([
    listCommands(hallId, { limit: list.pageSize, offset: from, status }),
    getHallTimeZone(hallId),
  ]);
  if (!result) return <ErrorState message={t.cxLoadFail} />;
  const events = await listCommandEvents(result.rows.map((r) => r.id));

  return (
    <div className="space-y-4">
      <LiveRefresh hallId={hallId} tables={["agent_commands"]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t.cxTitle}</h1>
        <nav aria-label={t.cxFilterStatus} className="flex flex-wrap gap-1 text-sm">
          {[undefined, ...STATUSES].map((s) => (
            <Link
              key={s ?? "all"}
              href={s ? `?status=${s}` : "?"}
              aria-current={status === s ? "true" : undefined}
              className="inline-flex min-h-10 items-center rounded-full border border-border px-3 py-1 aria-[current=true]:bg-neutral-bg aria-[current=true]:font-medium"
            >
              {s ? t[STATUS_KEY[s]!] : t.fAll}
            </Link>
          ))}
        </nav>
      </div>
      <p className="text-sm text-muted">{t.cxNote}</p>

      {result.rows.length === 0 ? (
        <EmptyState title={t.cxEmpty} description={t.cxEmptyDesc} />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
          {result.rows.map((c) => (
            <li key={c.id} className="p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {COMMAND_KEYS[c.type as StaffCommand]
                    ? t[COMMAND_KEYS[c.type as StaffCommand]]
                    : c.type}{" "}
                  · {c.deviceName}
                </span>
                <StatusBadge status={c.status} />
              </div>
              <div className="text-muted">
                {tpl(t.cxBy, { name: c.requestedBy ?? t.auSystem })} ·{" "}
                <HallTime value={c.createdAt} timeZone={tz} />
              </div>
              {c.errorMessage && <div className="mt-1 text-danger">{c.errorMessage}</div>}
              {(events[c.id]?.length ?? 0) > 0 && (
                <ol
                  className="mt-2 flex flex-wrap gap-2 text-xs text-muted"
                  aria-label={t.cxTimeline}
                >
                  {events[c.id]!.map((e) => (
                    <li key={e.id}>
                      {STATUS_KEY[e.status] ? t[STATUS_KEY[e.status]!] : e.status}{" "}
                      <HallTime value={e.createdAt} timeZone={tz} />
                    </li>
                  ))}
                </ol>
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

export default function CommandsPage({
  params,
  searchParams,
}: PageProps<"/halls/[hallId]/commands">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Commands params={params} searchParams={searchParams} />
    </Suspense>
  );
}
