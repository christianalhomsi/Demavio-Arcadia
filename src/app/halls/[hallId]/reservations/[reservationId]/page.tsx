import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HallTime } from "@/components/domain/HallTime";
import { permissionForPath } from "@/components/shell/nav";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getHallTimeZone } from "@/features/halls/queries";
import { getReservation } from "@/features/reservations/queries";
import { STATUS_KEYS } from "@/features/reservations/schemas";
import { isUuid } from "@/lib/auth/authorize";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import type { Messages } from "@/lib/i18n/messages";

export const metadata = { title: "Reservation" };

const EVENT_KEY: Record<string, keyof Messages> = {
  created: "evCreated",
  canceled: "evCanceled",
  checked_in: "evCheckedIn",
  no_show: "evNoShow",
  confirmed: "evConfirmed",
  rejected: "evRejected",
  expired: "evExpired",
};

async function ReservationDetail({
  params,
}: {
  params: Promise<{ hallId: string; reservationId: string }>;
}) {
  const { hallId, reservationId } = await params;
  await requireHallPermission(hallId, permissionForPath("/reservations"));
  if (!isUuid(reservationId)) notFound();
  const [r, tz] = await Promise.all([
    getReservation(hallId, reservationId),
    getHallTimeZone(hallId),
  ]);
  if (!r) notFound();
  const { t } = await getT();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{r.deviceName}</h1>
        <Badge
          tone={
            r.status === "checked_in"
              ? "success"
              : r.status === "confirmed"
                ? "info"
                : r.status === "pending"
                  ? "warning"
                  : "neutral"
          }
        >
          {t[STATUS_KEYS[r.status]]}
        </Badge>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">{t.colCustomer}</dt>
          <dd>{r.customerName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">{t.colTime}</dt>
          <dd>
            <HallTime value={r.startAt} timeZone={tz} /> →{" "}
            <HallTime value={r.endAt} timeZone={tz} />
          </dd>
        </div>
        {r.cancelReason && (
          <div className="sm:col-span-2">
            <dt className="text-muted">{t.rsCancelReasonLbl}</dt>
            <dd>{r.cancelReason}</dd>
          </div>
        )}
        {r.lateOverrideReason && (
          <div className="sm:col-span-2">
            <dt className="text-muted">{t.rsLateReasonLbl}</dt>
            <dd>{r.lateOverrideReason}</dd>
          </div>
        )}
        {r.sessionId && (
          <div>
            <dt className="text-muted">{t.rsSessionLbl}</dt>
            <dd>
              <Link className="underline" href={`/halls/${hallId}/sessions/${r.sessionId}`}>
                {t.cmViewSession}
              </Link>
            </dd>
          </div>
        )}
      </dl>
      <section aria-labelledby="ev-h">
        <h2 id="ev-h" className="mb-2 text-lg font-medium">
          {t.rsHistory}
        </h2>
        <ol className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card text-sm">
          {r.events.map((e) => (
            <li key={e.id} className="flex justify-between p-3">
              <span>{EVENT_KEY[e.type] ? t[EVENT_KEY[e.type]!] : e.type}</span>
              <HallTime value={e.at} timeZone={tz} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function ReservationDetailPage({
  params,
}: PageProps<"/halls/[hallId]/reservations/[reservationId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <ReservationDetail params={params} />
    </Suspense>
  );
}
