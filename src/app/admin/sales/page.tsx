import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AddSalesAccountButton,
  SalesTeamList,
  SoldHallsList,
} from "@/features/admin/components/SalesTeamPanels";
import { listHallsSold, listSalesTeam } from "@/features/admin/queries";
import { requirePlatformRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { parseListParams, toRange } from "@/lib/query/searchParams";

export const metadata = { title: "Sales" };

async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformRole("super_admin");
  const list = parseListParams(await searchParams, { pageSize: 25 });
  const [from] = toRange(list);
  const [halls, team] = await Promise.all([
    listHallsSold({ search: list.q, limit: list.pageSize, offset: from }),
    listSalesTeam(),
  ]);
  const { t } = await getT();
  // A responsible person is a sales admin (the default is the super admin creating the account).
  const responsibleOptions = (team ?? [])
    .filter((m) => m.role === "sales_admin" && m.status === "active")
    .map((m) => ({ value: m.userId, label: m.displayName ?? m.email ?? "" }));
  const managers = (team ?? []).filter((m) => m.role === "sales_admin");
  const employees = (team ?? []).filter((m) => m.role === "sales_agent");
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{t.stTitle}</h1>
        <p className="mt-1 text-sm text-muted">{t.stIntro}</p>
      </div>

      <section aria-labelledby="team-h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="team-h" className="text-lg font-medium">
            {t.stTeamTitle}
          </h2>
          <AddSalesAccountButton responsibleOptions={responsibleOptions} />
        </div>
        <p className="text-sm text-muted">{t.stTeamNote}</p>
        {team ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted">
                {t.stManagers} ({managers.length})
              </h3>
              <SalesTeamList team={managers} managerOptions={[]} />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted">
                {t.stEmployees} ({employees.length})
              </h3>
              <SalesTeamList team={employees} managerOptions={responsibleOptions} />
            </div>
          </div>
        ) : (
          <ErrorState message={t.stTeamLoadFail} />
        )}
      </section>

      <section aria-labelledby="halls-h" className="space-y-3">
        <h2 id="halls-h" className="text-lg font-medium">
          {t.stHallsTitle}
        </h2>
        <p className="text-sm text-muted">{t.stHallsNote}</p>
        <form method="get" role="search" className="flex gap-2">
          <label htmlFor="hq" className="sr-only">
            {t.stSearchLabel}
          </label>
          <input
            id="hq"
            name="q"
            defaultValue={list.q}
            placeholder={t.stSearchPh}
            className="h-11 w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm"
          />
          <button className="h-11 rounded-xl border border-border bg-surface px-4 text-sm font-medium sm:h-10">
            {t.plSrBtn}
          </button>
        </form>
        {halls ? (
          <>
            <SoldHallsList halls={halls.rows} />
            <Suspense fallback={null}>
              <Pagination page={list.page} pageSize={list.pageSize} total={halls.total} />
            </Suspense>
          </>
        ) : (
          <ErrorState message={t.stHallsLoadFail} />
        )}
      </section>
    </div>
  );
}

export default function AdminSalesPage({ searchParams }: PageProps<"/admin/sales">) {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <SalesPage searchParams={searchParams} />
    </Suspense>
  );
}
