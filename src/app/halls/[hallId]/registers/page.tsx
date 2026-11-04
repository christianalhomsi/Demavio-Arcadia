import Link from "next/link";
import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { HallTime } from "@/components/domain/HallTime";
import { Money } from "@/components/domain/Money";
import { PermissionGate } from "@/components/domain/PermissionGate";
import { permissionForPath } from "@/components/shell/nav";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getHallTimeZone } from "@/features/halls/queries";
import { MovementsList } from "@/features/shifts/components/MovementsList";
import { RecordMovementButton } from "@/features/shifts/components/RecordMovementDialog";
import { listCashMovements, listRegisters } from "@/features/shifts/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { parseListParams, toRange } from "@/lib/query/searchParams";
import { LiveRefresh } from "@/lib/realtime/LiveRefresh";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Registers" };

async function Registers({
  params,
  searchParams,
}: {
  params: Promise<{ hallId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/registers"));
  const list = parseListParams(await searchParams, { pageSize: 25 });
  const [from] = toRange(list);
  const { t } = await getT();
  const [registers, movements, tz] = await Promise.all([
    listRegisters(hallId),
    listCashMovements(hallId, { limit: list.pageSize, offset: from }),
    getHallTimeZone(hallId),
  ]);
  if (!registers || !movements) return <ErrorState message={t.rgLoadFail} />;

  return (
    <div className="space-y-6">
      <LiveRefresh hallId={hallId} tables={["shifts"]} />
      <h1 className="text-2xl font-semibold">{t.rgTitle}</h1>
      <p className="text-sm text-muted">{t.rgIntro}</p>
      <ul className="space-y-3">
        {registers.map((r) => (
          <li
            key={r.id}
            className="rounded-2xl border border-border bg-surface shadow-card p-4 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{r.name}</span>
              <Badge tone={r.openShiftId ? "info" : "neutral"}>
                {r.openShiftId ? t.rgShiftOpen : t.rgNoShift}
              </Badge>
            </div>
            {r.openShiftId && r.openSince && r.openExpectedCashMinor !== null && (
              <p className="mt-1 text-muted">
                {t.rgOpenSince} <HallTime value={r.openSince} timeZone={tz} />. {t.rgExpectedCash}{" "}
                <Money minor={r.openExpectedCashMinor} currency={r.currency} />.{" "}
                <Link className="underline" href={`/halls/${hallId}/shifts/${r.openShiftId}`}>
                  {t.rgOpenTheShift}
                </Link>
              </p>
            )}
            {r.openShiftId && (
              <div className="mt-3">
                <PermissionGate permission="payment.adjust">
                  <RecordMovementButton hallId={hallId} shiftId={r.openShiftId} />
                </PermissionGate>
              </div>
            )}
          </li>
        ))}
      </ul>
      <section aria-labelledby="mv-h" className="space-y-2">
        <h2 id="mv-h" className="text-lg font-medium">
          {t.rgRecent}
        </h2>
        <MovementsList movements={movements.rows} timeZone={tz} />
        <Suspense fallback={null}>
          <Pagination page={list.page} pageSize={list.pageSize} total={movements.total} />
        </Suspense>
      </section>
    </div>
  );
}

export default function RegistersPage({
  params,
  searchParams,
}: PageProps<"/halls/[hallId]/registers">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Registers params={params} searchParams={searchParams} />
    </Suspense>
  );
}
