import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HallTime } from "@/components/domain/HallTime";
import { Money } from "@/components/domain/Money";
import { permissionForPath } from "@/components/shell/nav";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getPaymentDetail, listPaymentRefunds } from "@/features/adjustments/queries";
import { getHallTimeZone } from "@/features/halls/queries";
import { isUuid } from "@/lib/auth/authorize";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { tpl, type Messages } from "@/lib/i18n/messages";

export const metadata = { title: "Payment" };

const STATUS: Record<"pending" | "approved" | "rejected", keyof Messages> = {
  pending: "rfPending",
  approved: "rfApproved",
  rejected: "rfRejected",
};
const REASON: Record<string, keyof Messages> = {
  customer_request: "rfrCustomer",
  overcharge: "rfrOvercharge",
  service_issue: "rfrService",
  other: "rfrOther",
};

async function PaymentDetail({
  params,
}: {
  params: Promise<{ hallId: string; paymentId: string }>;
}) {
  const { hallId, paymentId } = await params;
  await requireHallPermission(hallId, permissionForPath("/invoices"));
  if (!isUuid(paymentId)) notFound();
  const [p, refunds, tz] = await Promise.all([
    getPaymentDetail(paymentId),
    listPaymentRefunds(paymentId),
    getHallTimeZone(hallId),
  ]);
  if (!p || !refunds) notFound();
  const { t } = await getT();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {t.pyTitle} · <Money minor={p.amountMinor} currency={p.currency} />
        </h1>
        <Badge tone="neutral">{p.method === "cash" ? t.methodCash : t.methodWallet}</Badge>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">{t.pyInvoice}</dt>
          <dd>
            <Link className="underline" href={`/halls/${hallId}/invoices/${p.invoiceId}`}>
              {p.invoiceNumber}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-muted">{t.colWhen}</dt>
          <dd>
            <HallTime value={p.createdAt} timeZone={tz} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">{t.pyOperator}</dt>
          <dd>{p.operatorName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">{t.pyCustomer}</dt>
          <dd>{p.customerName ?? "—"}</dd>
        </div>
        {p.shiftId && (
          <div>
            <dt className="text-muted">{t.pyShift}</dt>
            <dd>
              <Link className="underline" href={`/halls/${hallId}/shifts/${p.shiftId}`}>
                {t.pyDetail}
              </Link>
            </dd>
          </div>
        )}
        <div>
          <dt className="text-muted">{t.pyRefunded}</dt>
          <dd className="tabular-nums">
            <Money minor={p.refundedMinor} currency={p.currency} />
            {p.refundPendingMinor > 0 && (
              <span className="text-muted">
                {" · "}
                {t.pyRefundPending}: <Money minor={p.refundPendingMinor} currency={p.currency} />
              </span>
            )}
          </dd>
        </div>
      </dl>

      <section aria-labelledby="pr-h" className="space-y-2">
        <h2 id="pr-h" className="text-lg font-medium">
          {t.pyRefunds}
        </h2>
        {refunds.length === 0 ? (
          <p className="text-sm text-muted">{t.pyNoRefunds}</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface text-sm shadow-card">
            {refunds.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-3">
                <span>
                  {tpl(t.pyRefundLine, {
                    status: t[STATUS[r.status]] as string,
                    reason: t[REASON[r.reasonCode] ?? "rfrOther"] as string,
                  })}
                  <span className="block text-xs text-muted">
                    {tpl(t.rfRequestedBy, { name: r.requestedByName ?? "—" })}{" "}
                    <HallTime value={r.requestedAt} timeZone={tz} />
                  </span>
                </span>
                <Money minor={r.amountMinor} currency={p.currency} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link className="text-sm underline" href={`/halls/${hallId}/invoices/${p.invoiceId}`}>
        {t.pyBack}
      </Link>
    </div>
  );
}

export default function PaymentDetailPage({
  params,
}: PageProps<"/halls/[hallId]/payments/[paymentId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <PaymentDetail params={params} />
    </Suspense>
  );
}
