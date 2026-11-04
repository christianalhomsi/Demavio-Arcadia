import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { permissionForPath } from "@/components/shell/nav";
import { Skeleton } from "@/components/ui/skeleton";
import { getHallTimeZone } from "@/features/halls/queries";
import { RefundsPanel } from "@/features/refunds/components/RefundsPanel";
import { listRefunds } from "@/features/refunds/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { parseListParams, toRange } from "@/lib/query/searchParams";
import { LiveRefresh } from "@/lib/realtime/LiveRefresh";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Refunds" };

async function Refunds({
  params,
  searchParams,
}: {
  params: Promise<{ hallId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hallId } = await params;
  const { ctx } = await requireHallPermission(hallId, permissionForPath("/refunds"));
  const list = parseListParams(await searchParams, { pageSize: 25 });
  const [from] = toRange(list);
  const [result, tz] = await Promise.all([
    listRefunds(hallId, { limit: list.pageSize, offset: from }),
    getHallTimeZone(hallId),
  ]);
  if (!result) return <ErrorState message={(await getT()).t.rfLoadFail} />;

  return (
    <>
      <LiveRefresh hallId={hallId} tables={["refunds"]} />
      <RefundsPanel
        hallId={hallId}
        timeZone={tz}
        refunds={result.rows}
        currentUserName={ctx.profile.display_name ?? ctx.profile.email}
      />
      <Suspense fallback={null}>
        <Pagination page={list.page} pageSize={list.pageSize} total={result.total} />
      </Suspense>
    </>
  );
}

export default function RefundsPage({
  params,
  searchParams,
}: PageProps<"/halls/[hallId]/refunds">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Refunds params={params} searchParams={searchParams} />
    </Suspense>
  );
}
