import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { HallTime } from "@/components/domain/HallTime";
import { Money } from "@/components/domain/Money";
import { permissionForPath } from "@/components/shell/nav";
import { Skeleton } from "@/components/ui/skeleton";
import { getHallTimeZone } from "@/features/halls/queries";
import { InvoiceStatusBadge } from "@/features/invoices/components/InvoiceStatusBadge";
import { listInvoices } from "@/features/invoices/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { parseListParams, toRange } from "@/lib/query/searchParams";
import { LiveRefresh } from "@/lib/realtime/LiveRefresh";
import { getT } from "@/lib/i18n/server";
import type { Messages } from "@/lib/i18n/messages";

export const metadata = { title: "Invoices" };

const FILTERS: { key: string; label: keyof Messages }[] = [
  { key: "", label: "fAll" },
  { key: "outstanding", label: "fOutstanding" },
  { key: "paid", label: "fPaid" },
  { key: "voided", label: "fVoided" },
];

async function Invoices({
  params,
  searchParams,
}: {
  params: Promise<{ hallId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/invoices"));
  const list = parseListParams(await searchParams, { pageSize: 25 });
  const f = FILTERS.some((x) => x.key && x.key === list.filters.show) ? list.filters.show : "";
  const [from] = toRange(list);

  const { t } = await getT();
  const [result, tz] = await Promise.all([
    listInvoices(hallId, {
      limit: list.pageSize,
      offset: from,
      outstandingOnly: f === "outstanding",
      status: f === "paid" || f === "voided" ? f : undefined,
    }),
    getHallTimeZone(hallId),
  ]);
  if (!result) return <ErrorState message={t.ivLoadFail} />;

  return (
    <div className="space-y-4">
      <LiveRefresh hallId={hallId} tables={["invoices", "payments"]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t.ivTitle}</h1>
        <nav aria-label={t.ivFilter} className="flex flex-wrap gap-2 text-sm">
          {FILTERS.map((x) => (
            <Link
              key={x.label}
              href={x.key ? `?show=${x.key}` : "?"}
              aria-current={f === x.key ? "true" : undefined}
              className="inline-flex min-h-10 items-center rounded-full border border-border px-4 py-1 aria-[current=true]:bg-neutral-bg aria-[current=true]:font-medium"
            >
              {t[x.label]}
            </Link>
          ))}
        </nav>
      </div>

      {result.rows.length === 0 ? (
        <EmptyState title={t.ivEmpty} description={t.ivEmptyDesc} />
      ) : (
        <>
        <ul className="space-y-2 md:hidden">
          {result.rows.map((i) => (
            <li key={i.id}>
              <Link
                href={`/halls/${hallId}/invoices/${i.id}`}
                className="block rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors active:bg-neutral-bg"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{i.number}</span>
                  <InvoiceStatusBadge status={i.status} />
                </div>
                <p className="mt-1 truncate text-sm text-muted">
                  {[i.deviceName, i.customerName].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-2 flex items-end justify-between gap-2 text-sm">
                  <span className="text-xs text-muted">
                    <HallTime value={i.createdAt} timeZone={tz} />
                  </span>
                  <span className="text-end">
                    <span className="block font-medium tabular-nums">
                      <Money minor={i.totalMinor} currency={i.currency} />
                    </span>
                    {i.outstandingMinor > 0 && (
                      <span className="block text-xs font-semibold tabular-nums text-warning">
                        {t.colOutstanding}: <Money minor={i.outstandingMinor} currency={i.currency} />
                      </span>
                    )}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-card md:block">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">{t.ivCaption}</caption>
            <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-2">
                  {t.colInvoice}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colCreated}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colDevice}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colCustomer}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colStatus}
                </th>
                <th scope="col" className="px-4 py-2 text-end">
                  {t.colTotal}
                </th>
                <th scope="col" className="px-4 py-2 text-end">
                  {t.colOutstanding}
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((i) => (
                <tr key={i.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <Link
                      className="font-medium hover:underline"
                      href={`/halls/${hallId}/invoices/${i.id}`}
                    >
                      {i.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <HallTime value={i.createdAt} timeZone={tz} />
                  </td>
                  <td className="px-4 py-2">{i.deviceName}</td>
                  <td className="px-4 py-2">{i.customerName ?? "—"}</td>
                  <td className="px-4 py-2">
                    <InvoiceStatusBadge status={i.status} />
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">
                    <Money minor={i.totalMinor} currency={i.currency} />
                  </td>
                  <td
                    className={
                      i.outstandingMinor > 0
                        ? "px-4 py-2 text-end font-semibold tabular-nums text-warning"
                        : "px-4 py-2 text-end tabular-nums"
                    }
                  >
                    <Money minor={i.outstandingMinor} currency={i.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      <Suspense fallback={null}>
        <Pagination page={list.page} pageSize={list.pageSize} total={result.total} />
      </Suspense>
    </div>
  );
}

export default function InvoicesPage({
  params,
  searchParams,
}: PageProps<"/halls/[hallId]/invoices">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Invoices params={params} searchParams={searchParams} />
    </Suspense>
  );
}
