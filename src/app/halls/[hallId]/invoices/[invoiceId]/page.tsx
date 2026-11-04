import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HallTime } from "@/components/domain/HallTime";
import { Money } from "@/components/domain/Money";
import { permissionForPath } from "@/components/shell/nav";
import { Skeleton } from "@/components/ui/skeleton";
import { getHallSettingsBundle, getHallTimeZone } from "@/features/halls/queries";
import { WriteOffDialog } from "@/features/adjustments/components/WriteOffDialog";
import { InvoiceDiscounts } from "@/features/discounts/components/InvoiceDiscounts";
import { listDiscounts, listInvoiceDiscounts } from "@/features/discounts/queries";
import { InvoiceActions } from "@/features/invoices/components/InvoiceActions";
import { InvoiceStatusBadge } from "@/features/invoices/components/InvoiceStatusBadge";
import { getInvoiceDetail } from "@/features/invoices/queries";
import { listWallets } from "@/features/wallets/queries";
import { isUuid } from "@/lib/auth/authorize";
import { requireHallPermission } from "@/lib/auth/guards";
import { formatDuration } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { LiveRefresh } from "@/lib/realtime/LiveRefresh";
import { getT } from "@/lib/i18n/server";
import { tpl } from "@/lib/i18n/messages";

export const metadata = { title: "Invoice" };

async function InvoiceDetail({
  params,
}: {
  params: Promise<{ hallId: string; invoiceId: string }>;
}) {
  const { hallId, invoiceId } = await params;
  const { membership } = await requireHallPermission(hallId, permissionForPath("/invoices"));
  if (!isUuid(invoiceId)) notFound();

  const [detail, tz, bundle] = await Promise.all([
    getInvoiceDetail(hallId, invoiceId),
    getHallTimeZone(hallId),
    getHallSettingsBundle(hallId),
  ]);
  if (!detail || !bundle) notFound();
  const { t } = await getT();
  const { invoice: inv, items, payments } = detail;

  const methods = bundle.settings.paymentMethods;
  const canSeeWallets =
    membership.permissions.includes("wallet.view") && methods.includes("wallet");
  const canApply = membership.permissions.includes("discount.apply");
  const [appliedDiscounts, availableDiscounts] = await Promise.all([
    listInvoiceDiscounts(invoiceId),
    canApply ? listDiscounts(hallId) : null,
  ]);
  const wallets = canSeeWallets
    ? ((await listWallets(hallId, { limit: 100, offset: 0 }))?.rows ?? [])
    : [];

  return (
    <div className="space-y-6">
      <LiveRefresh hallId={hallId} tables={["invoices", "payments"]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{inv.number}</h1>
        <InvoiceStatusBadge status={inv.status} />
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">{t.colDevice}</dt>
          <dd>{inv.deviceName}</dd>
        </div>
        <div>
          <dt className="text-muted">{t.colCustomer}</dt>
          <dd>{inv.customerName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">{t.colCreated}</dt>
          <dd>
            <HallTime value={inv.createdAt} timeZone={tz} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">{t.rsSessionLbl}</dt>
          <dd>
            <Link className="underline" href={`/halls/${hallId}/sessions/${inv.sessionId}`}>
              {tpl(t.ivUsedN, { d: formatDuration(inv.billableSeconds * 1000) })}
            </Link>
          </dd>
        </div>
      </dl>

      <section aria-labelledby="items-h">
        <h2 id="items-h" className="sr-only">
          {t.ivCharges}
        </h2>
        <table className="w-full text-sm">
          <caption className="sr-only">{t.ivCaptionDetail}</caption>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-border">
                <td className="py-2">
                  {i.description}
                  <div className="text-xs text-muted">
                    {i.detail?.kind === "write_off"
                      ? t.woLine
                      : i.detail?.kind === "discount"
                        ? t.dcAmount
                        : i.detail?.kind === "package"
                          ? tpl(t.pkLineDur, { n: Number(i.detail.duration_minutes ?? 0) })
                          : i.detail?.kind === "product"
                            ? tpl(t.pdLineQty, {
                                qty: Number(i.detail.quantity ?? 1),
                                unit: formatMoney(
                                  Number(i.detail.unit_price_minor ?? 0),
                                  inv.currency,
                                ),
                              })
                            : tpl(t.ivBilledAt, {
                                m: Number(i.detail?.billed_minutes ?? inv.billedMinutes),
                                rate: formatMoney(
                                  Number(i.detail?.rate_per_hour_minor ?? 0),
                                  inv.currency,
                                ),
                              })}
                  </div>
                </td>
                <td className="py-2 text-end tabular-nums">
                  <Money minor={i.amountMinor} currency={inv.currency} />
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="py-2 text-start font-medium">
                {t.colTotal}
              </th>
              <td className="py-2 text-end tabular-nums">
                <Money minor={inv.totalMinor} currency={inv.currency} />
              </td>
            </tr>
            <tr>
              <th scope="row" className="py-1 text-start font-normal text-muted">
                {t.fPaid}
              </th>
              <td className="py-1 text-end tabular-nums">
                <Money minor={inv.paidMinor} currency={inv.currency} />
              </td>
            </tr>
            {inv.refundedMinor > 0 && (
              <tr>
                <th scope="row" className="py-1 text-start font-normal text-muted">
                  {t.ivRefunded}
                </th>
                <td className="py-1 text-end tabular-nums">
                  <Money minor={inv.refundedMinor} currency={inv.currency} />
                </td>
              </tr>
            )}
            <tr>
              <th scope="row" className="py-1 text-start font-medium">
                {t.colOutstanding}
              </th>
              <td className="py-1 text-end font-medium tabular-nums">
                <Money minor={inv.outstandingMinor} currency={inv.currency} />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <InvoiceDiscounts
        hallId={hallId}
        invoiceId={invoiceId}
        currency={inv.currency}
        applied={appliedDiscounts ?? []}
        available={availableDiscounts ?? []}
        payable={inv.status === "open" || inv.status === "partially_paid"}
        isOwner={membership.role === "owner"}
        limitMinor={membership.discount_limit_minor}
      />

      {(inv.status === "open" || inv.status === "partially_paid") && (
        <WriteOffDialog hallId={hallId} invoiceId={invoiceId} currency={inv.currency} />
      )}

      <InvoiceActions
        hallId={hallId}
        invoice={inv}
        payments={payments}
        methods={methods}
        partialAllowed={bundle.settings.allowPartialPayments}
        wallets={wallets.map((w) => ({
          id: w.id,
          label: `${w.customerName ?? w.customerEmail} · ${formatMoney(w.balanceMinor, w.currency)}`,
          balanceMinor: w.balanceMinor,
          currency: w.currency,
          frozen: w.status === "frozen",
        }))}
      />
    </div>
  );
}

export default function InvoiceDetailPage({
  params,
}: PageProps<"/halls/[hallId]/invoices/[invoiceId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <InvoiceDetail params={params} />
    </Suspense>
  );
}
