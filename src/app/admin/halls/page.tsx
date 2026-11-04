import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { AddHallButton, HallsList } from "@/features/admin/components/HallsPanels";
import { listHallsSold, listSubscriptionPlans } from "@/features/admin/queries";
import { requirePlatformRole } from "@/lib/auth/guards";
import { parseListParams, toRange } from "@/lib/query/searchParams";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Halls" };

async function Halls({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformRole("super_admin");
  const list = parseListParams(await searchParams, { pageSize: 25 });
  const [from] = toRange(list);
  const [result, plans] = await Promise.all([
    listHallsSold({ search: list.q, limit: list.pageSize, offset: from }),
    listSubscriptionPlans(),
  ]);
  const { t } = await getT();
  if (!result) return <ErrorState message={t.stHallsLoadFail} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.plTenTitle}</h1>
        <AddHallButton plans={(plans ?? []).filter((p) => p.status === "active")} />
      </div>
      <form method="get" role="search" className="flex gap-2">
        <label htmlFor="tq" className="sr-only">
          {t.stSearchLabel}
        </label>
        <input
          id="tq"
          name="q"
          defaultValue={list.q}
          placeholder={t.stSearchPh}
          className="h-11 w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm"
        />
        <button className="h-11 rounded-xl border border-border bg-surface px-4 text-sm font-medium sm:h-10">
          {t.plSrBtn}
        </button>
      </form>
      <HallsList halls={result.rows} />
      <Suspense fallback={null}>
        <Pagination page={list.page} pageSize={list.pageSize} total={result.total} />
      </Suspense>
    </div>
  );
}

export default function HallsPage({ searchParams }: PageProps<"/admin/halls">) {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <Halls searchParams={searchParams} />
    </Suspense>
  );
}
