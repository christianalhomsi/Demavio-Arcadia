import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { permissionForPath } from "@/components/shell/nav";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletsPanel } from "@/features/wallets/components/WalletsPanel";
import { listWallets } from "@/features/wallets/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { parseListParams, toRange } from "@/lib/query/searchParams";
import { LiveRefresh } from "@/lib/realtime/LiveRefresh";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Wallets" };

async function Wallets({
  params,
  searchParams,
}: {
  params: Promise<{ hallId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/wallets"));
  const list = parseListParams(await searchParams, { pageSize: 25 });
  const [from] = toRange(list);
  const result = await listWallets(hallId, { search: list.q, limit: list.pageSize, offset: from });
  if (!result) return <ErrorState message={(await getT()).t.wlLoadFail} />;

  return (
    <>
      <LiveRefresh hallId={hallId} tables={["wallets"]} />
      <WalletsPanel hallId={hallId} wallets={result.rows} />
      <Suspense fallback={null}>
        <Pagination page={list.page} pageSize={list.pageSize} total={result.total} />
      </Suspense>
    </>
  );
}

export default function WalletsPage({
  params,
  searchParams,
}: PageProps<"/halls/[hallId]/wallets">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Wallets params={params} searchParams={searchParams} />
    </Suspense>
  );
}
