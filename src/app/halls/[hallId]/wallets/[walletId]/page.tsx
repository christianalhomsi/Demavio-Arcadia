import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { Pagination } from "@/components/data/Pagination";
import { HallTime } from "@/components/domain/HallTime";
import { Money } from "@/components/domain/Money";
import { permissionForPath } from "@/components/shell/nav";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getHallTimeZone } from "@/features/halls/queries";
import { WalletControls } from "@/features/wallets/components/WalletControls";
import { TopUpDialog } from "@/features/wallets/components/WalletsPanel";
import { listLedger, listWallets } from "@/features/wallets/queries";
import { isUuid } from "@/lib/auth/authorize";
import { requireHallPermission } from "@/lib/auth/guards";
import { parseListParams, toRange } from "@/lib/query/searchParams";
import { LiveRefresh } from "@/lib/realtime/LiveRefresh";
import { getT } from "@/lib/i18n/server";
import type { Messages } from "@/lib/i18n/messages";

export const metadata = { title: "Wallet" };

const KIND: Record<"top_up" | "payment" | "refund" | "withdrawal", keyof Messages> = {
  withdrawal: "wlKindWithdrawal",
  top_up: "wlKindTopUp",
  payment: "wlKindPayment",
  refund: "wlKindRefund",
};

async function WalletDetail({
  params,
  searchParams,
}: {
  params: Promise<{ hallId: string; walletId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hallId, walletId } = await params;
  await requireHallPermission(hallId, permissionForPath("/wallets"));
  if (!isUuid(walletId)) notFound();
  const list = parseListParams(await searchParams, { pageSize: 25 });
  const [from] = toRange(list);

  const [wallets, ledger, tz] = await Promise.all([
    listWallets(hallId, { limit: 1, offset: 0, walletId }),
    listLedger(walletId, { limit: list.pageSize, offset: from }),
    getHallTimeZone(hallId),
  ]);
  const w = wallets?.rows[0];
  if (!w || !ledger) notFound();
  const { t } = await getT();
  const tr = t;

  return (
    <div className="space-y-6">
      <LiveRefresh hallId={hallId} tables={["wallets"]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{w.customerName ?? w.customerEmail}</h1>
          <p className="text-sm text-muted">{w.customerEmail}</p>
        </div>
        <TopUpDialog
          hallId={hallId}
          wallet={{ id: w.id, currency: w.currency }}
          frozen={w.status === "frozen"}
        />
      </div>
      <WalletControls
        hallId={hallId}
        walletId={w.id}
        currency={w.currency}
        balanceMinor={w.balanceMinor}
        frozen={w.status === "frozen"}
      />
      <div className="rounded-2xl border border-border bg-surface shadow-card p-4">
        <div className="text-sm text-muted">{t.wlBalanceStored}</div>
        <div className="text-3xl font-semibold tabular-nums">
          <Money minor={w.balanceMinor} currency={w.currency} />
        </div>
        {w.status === "frozen" && (
          <Badge tone="warning" className="mt-2">
            {t.wlFrozen}
          </Badge>
        )}
      </div>

      <section aria-labelledby="led-h">
        <h2 id="led-h" className="mb-2 text-lg font-medium">
          {t.wlLedger}
        </h2>
        {ledger.rows.length === 0 ? (
          <EmptyState title={t.wlNoTx} />
        ) : (
          <div className="stack-table overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
            <table className="w-full text-start text-sm">
              <caption className="sr-only">{t.wlLedgerCaption}</caption>
              <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2">
                    {t.colWhen}
                  </th>
                  <th scope="col" className="px-4 py-2">
                    {t.colType}
                  </th>
                  <th scope="col" className="px-4 py-2">
                    {t.colBy}
                  </th>
                  <th scope="col" className="px-4 py-2 text-end">
                    {t.colAmount}
                  </th>
                  <th scope="col" className="px-4 py-2 text-end">
                    {t.colBalanceAfter}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ledger.rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <HallTime value={row.createdAt} timeZone={tz} />
                    </td>
                    <td className="px-4 py-2">
                      {tr[KIND[row.kind]]}
                      {row.reason && <span className="block text-xs text-muted">{row.reason}</span>}
                      {row.invoiceId && (
                        <>
                          {" "}
                          <Link
                            className="underline"
                            href={`/halls/${hallId}/invoices/${row.invoiceId}`}
                          >
                            {tr.wlInvoiceLink}
                          </Link>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2">{row.actorName ?? "—"}</td>
                    <td className="px-4 py-2 text-end tabular-nums">
                      {row.amountMinor > 0 ? "+" : "−"}
                      <Money minor={Math.abs(row.amountMinor)} currency={w.currency} />
                    </td>
                    <td className="px-4 py-2 text-end tabular-nums">
                      <Money minor={row.balanceAfterMinor} currency={w.currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Suspense fallback={null}>
          <Pagination page={list.page} pageSize={list.pageSize} total={ledger.total} />
        </Suspense>
      </section>
    </div>
  );
}

export default function WalletDetailPage({
  params,
  searchParams,
}: PageProps<"/halls/[hallId]/wallets/[walletId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <WalletDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}
