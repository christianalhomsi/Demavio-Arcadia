import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HallTime } from "@/components/domain/HallTime";
import { permissionForPath } from "@/components/shell/nav";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { getHallTimeZone } from "@/features/halls/queries";
import { InvoiceStatusBadge } from "@/features/invoices/components/InvoiceStatusBadge";
import { getInvoiceForSession } from "@/features/invoices/queries";
import { getSession } from "@/features/sessions/queries";
import { END_TYPE_KEYS, type EndType } from "@/features/sessions/schemas";
import { isUuid } from "@/lib/auth/authorize";
import { SessionItems } from "@/features/products/components/SessionItems";
import { listSessionItems } from "@/features/products/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { formatDuration } from "@/lib/dates";
import { getT } from "@/lib/i18n/server";
import { tpl, type Messages } from "@/lib/i18n/messages";

export const metadata = { title: "Session" };

const EVENT_KEY: Record<string, keyof Messages> = {
  started: "seStarted",
  extended: "seExtended",
  converted_to_open: "seConverted",
  ended: "seEnded",
  invoice_created: "seInvoiceCreated",
  invoice_pending: "seInvoicePending",
  item_added: "evItemAdded",
  item_removed: "evItemRemoved",
};

async function SessionDetail({
  params,
}: {
  params: Promise<{ hallId: string; sessionId: string }>;
}) {
  const { hallId, sessionId } = await params;
  const { membership } = await requireHallPermission(hallId, permissionForPath("/sessions"));
  if (!isUuid(sessionId)) notFound();
  const [data, tz] = await Promise.all([getSession(hallId, sessionId), getHallTimeZone(hallId)]);
  if (!data) notFound();
  const { t } = await getT();
  const { session: s, events } = data;
  // Null when the viewer lacks invoice.view or no invoice exists yet (the database decides).
  const invoice = await getInvoiceForSession(sessionId);
  const canSeeItems =
    membership.permissions.includes("product.sell") ||
    membership.permissions.includes("invoice.view");
  const items = canSeeItems ? await listSessionItems(sessionId) : null;
  const itemsLive = !s.endedAt && (s.status === "starting" || s.status === "in_progress");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{s.deviceName}</h1>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">{t.colCustomer}</dt>
          <dd>{s.customerName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">{t.colType}</dt>
          <dd>{s.type === "open" ? t.ssOpen : t.ssFixed}</dd>
        </div>
        <div>
          <dt className="text-muted">{t.colStarted}</dt>
          <dd>
            <HallTime value={s.startedAt} timeZone={tz} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">{s.endedAt ? t.ssEnded : t.ssSchedEnd}</dt>
          <dd>
            {s.endedAt ? (
              <HallTime value={s.endedAt} timeZone={tz} />
            ) : s.scheduledEndAt ? (
              <HallTime value={s.scheduledEndAt} timeZone={tz} />
            ) : (
              t.ssOpenEnded
            )}
          </dd>
        </div>
        {s.billableSeconds !== null && (
          <div>
            <dt className="text-muted">{t.ssTimeUsed}</dt>
            <dd className="tabular-nums">{formatDuration(s.billableSeconds * 1000)}</dd>
          </div>
        )}
        {s.endType && (
          <div>
            <dt className="text-muted">{t.ssHowItEnded}</dt>
            <dd>
              {END_TYPE_KEYS[s.endType as EndType]
                ? t[END_TYPE_KEYS[s.endType as EndType]]
                : s.endType}
            </dd>
          </div>
        )}
        {invoice && (
          <div>
            <dt className="text-muted">{t.ssInvoice}</dt>
            <dd className="flex items-center gap-2">
              <Link className="underline" href={`/halls/${hallId}/invoices/${invoice.id}`}>
                {invoice.number}
              </Link>
              <InvoiceStatusBadge status={invoice.status} />
            </dd>
          </div>
        )}
        {s.reservationId && (
          <div>
            <dt className="text-muted">{t.ssReservation}</dt>
            <dd>
              <Link className="underline" href={`/halls/${hallId}/reservations/${s.reservationId}`}>
                {t.ssViewRes}
              </Link>
            </dd>
          </div>
        )}
      </dl>
      {items && (
        <SessionItems hallId={hallId} sessionId={sessionId} items={items} live={itemsLive} />
      )}
      <section aria-labelledby="se-h">
        <h2 id="se-h" className="mb-2 text-lg font-medium">
          {t.rsHistory}
        </h2>
        <ol className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card text-sm">
          {events.map((e) => (
            <li key={e.id} className="p-3">
              <div className="flex justify-between">
                <span>{EVENT_KEY[e.type] ? t[EVENT_KEY[e.type]!] : e.type}</span>
                <HallTime value={e.at} timeZone={tz} />
              </div>
              {e.reason && (
                <div className="text-muted">{tpl(t.ssReasonN, { reason: e.reason })}</div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function SessionDetailPage({
  params,
}: PageProps<"/halls/[hallId]/sessions/[sessionId]">) {
  return (
    <Suspense fallback={<DetailPageSkeleton section="list" />}>
      <SessionDetail params={params} />
    </Suspense>
  );
}
