import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { permissionForPath } from "@/components/shell/nav";
import { TablePageSkeleton } from "@/components/ui/skeleton";
import { getHallTimeZone } from "@/features/halls/queries";
import { ShiftsPanel } from "@/features/shifts/components/ShiftsPanel";
import { listShifts } from "@/features/shifts/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { parseListParams, toRange } from "@/lib/query/searchParams";
import { LiveRefresh } from "@/lib/realtime/LiveRefresh";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Shifts" };

async function Shifts({
  params,
  searchParams,
}: {
  params: Promise<{ hallId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/shifts"));
  const list = parseListParams(await searchParams, { pageSize: 25 });
  const [from] = toRange(list);
  const [result, tz] = await Promise.all([
    listShifts(hallId, { limit: list.pageSize, offset: from }),
    getHallTimeZone(hallId),
  ]);
  if (!result) return <ErrorState message={(await getT()).t.shLoadFail} />;

  return (
    <>
      <LiveRefresh hallId={hallId} tables={["shifts"]} />
      <ShiftsPanel hallId={hallId} timeZone={tz} shifts={result.rows} />
      <Suspense fallback={null}>
        <Pagination page={list.page} pageSize={list.pageSize} total={result.total} />
      </Suspense>
    </>
  );
}

export default function ShiftsPage({ params, searchParams }: PageProps<"/halls/[hallId]/shifts">) {
  return (
    <Suspense fallback={<TablePageSkeleton pagination cols={5} />}>
      <Shifts params={params} searchParams={searchParams} />
    </Suspense>
  );
}
