import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditsList } from "@/features/sales/components/SalesPanels";
import { listSalesCredits } from "@/features/sales/queries";
import { requirePlatformRole } from "@/lib/auth/guards";
import { parseListParams, toRange } from "@/lib/query/searchParams";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Credits" };

async function Credits({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Credits are for sales managers only; agents do not see this page.
  await requirePlatformRole("sales_admin");
  const list = parseListParams(await searchParams, { pageSize: 25 });
  const [from] = toRange(list);
  const result = await listSalesCredits({ limit: list.pageSize, offset: from });
  const { t } = await getT();
  if (!result) return <ErrorState message={t.slCreditsLoadFail} />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t.slAttrTitle}</h1>
      <p className="text-sm text-muted">{t.slAttrNote}</p>
      <CreditsList credits={result.rows} timeZone="UTC" />
      <Suspense fallback={null}>
        <Pagination page={list.page} pageSize={list.pageSize} total={result.total} />
      </Suspense>
    </div>
  );
}

export default function AttributionPage({ searchParams }: PageProps<"/sales/attribution">) {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <Credits searchParams={searchParams} />
    </Suspense>
  );
}
