import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { HallTime } from "@/components/domain/HallTime";
import { Money } from "@/components/domain/Money";
import { permissionForPath } from "@/components/shell/nav";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { listAdjustments } from "@/features/adjustments/queries";
import { getHallTimeZone } from "@/features/halls/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import type { Messages } from "@/lib/i18n/messages";
import { parseListParams, toRange } from "@/lib/query/searchParams";

export const metadata = { title: "Adjustments" };

const KIND: Record<"write_off" | "discount" | "void", keyof Messages> = {
  write_off: "adKindWriteOff",
  discount: "adKindDiscount",
  void: "adKindVoid",
};

async function Adjustments({
  params,
  searchParams,
}: {
  params: Promise<{ hallId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/adjustments"));
  const list = parseListParams(await searchParams, { pageSize: 25 });
  const [from] = toRange(list);
  const [data, tz] = await Promise.all([
    listAdjustments(hallId, { limit: list.pageSize, offset: from }),
    getHallTimeZone(hallId),
  ]);
  const { t } = await getT();
  if (!data) return <ErrorState message={t.adLoadFail} />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t.adTitle}</h1>
      <p className="text-sm text-muted">{t.adIntro}</p>
      {data.rows.length === 0 ? (
        <EmptyState title={t.adEmpty} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">{t.adCaption}</caption>
            <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-2">
                  {t.colWhen}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colType}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colInvoice}
                </th>
                <th scope="col" className="px-4 py-2 text-end">
                  {t.colAmount}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.adReason}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colBy}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={`${r.kind}-${r.invoiceId}-${r.createdAt}`}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-2">
                    <HallTime value={r.createdAt} timeZone={tz} />
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone="neutral">{t[KIND[r.kind]] as string}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Link className="underline" href={`/halls/${hallId}/invoices/${r.invoiceId}`}>
                      {r.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">
                    <Money minor={r.amountMinor} currency={r.currency} />
                  </td>
                  <td className="px-4 py-2">{r.reason ?? "—"}</td>
                  <td className="px-4 py-2">{r.actorName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Suspense fallback={null}>
        <Pagination page={list.page} pageSize={list.pageSize} total={data.total} />
      </Suspense>
    </div>
  );
}

export default function AdjustmentsPage({
  params,
  searchParams,
}: PageProps<"/halls/[hallId]/adjustments">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Adjustments params={params} searchParams={searchParams} />
    </Suspense>
  );
}
