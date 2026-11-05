import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { permissionForPath } from "@/components/shell/nav";
import { TablePageSkeleton } from "@/components/ui/skeleton";
import { ExpensesPanel } from "@/features/expenses/components/ExpensesPanel";
import { listExpenses } from "@/features/expenses/queries";
import { getHallCurrency } from "@/features/invoices/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { parseListParams, toRange } from "@/lib/query/searchParams";

export const metadata = { title: "Expenses" };

async function Expenses({
  params,
  searchParams,
}: {
  params: Promise<{ hallId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/expenses"));
  const list = parseListParams(await searchParams, { pageSize: 25 });
  const [from] = toRange(list);
  const [data, currency] = await Promise.all([
    listExpenses(hallId, { limit: list.pageSize, offset: from }),
    getHallCurrency(hallId),
  ]);
  if (!data || !currency) return <ErrorState message={(await getT()).t.exLoadFail} />;
  return (
    <div className="space-y-4">
      <ExpensesPanel
        hallId={hallId}
        currency={currency}
        rows={data.rows}
        totalAmountMinor={data.totalAmountMinor}
      />
      <Suspense fallback={null}>
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} />
      </Suspense>
    </div>
  );
}

export default function ExpensesPage({
  params,
  searchParams,
}: PageProps<"/halls/[hallId]/expenses">) {
  return (
    <Suspense fallback={<TablePageSkeleton pagination cols={5} />}>
      <Expenses params={params} searchParams={searchParams} />
    </Suspense>
  );
}
