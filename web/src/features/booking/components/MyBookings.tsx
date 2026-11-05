"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { formatLocale, type Messages } from "@/lib/i18n/messages";
import { cancelMyReservationAction } from "../actions";
import type { MyReservation } from "../queries";

const TONE: Record<MyReservation["status"], Tone> = {
  pending: "warning",
  confirmed: "info",
  checked_in: "success",
  canceled: "neutral",
  no_show: "warning",
};

const LABEL: Record<MyReservation["status"], keyof Messages> = {
  pending: "statusPending",
  confirmed: "statusConfirmed",
  checked_in: "statusCheckedIn",
  canceled: "statusCanceled",
  no_show: "statusNoShow",
};

function Row({ r }: { r: MyReservation }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const f = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(formatLocale(locale), { timeZone: r.timeZone, ...o });
  const time = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;

  function cancel() {
    setError(null);
    start(async () => {
      const res = await cancelMyReservationAction(r.id);
      if (res.ok) router.refresh();
      else {
        setError(
          res.message.toLowerCase().includes("too late") ? t.errPastDeadline : t.errNotCancelable,
        );
        router.refresh();
      }
    });
  }

  return (
    <li className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{r.deviceName}</p>
          <p className="text-sm text-muted">{r.hallName}</p>
        </div>
        <Badge tone={TONE[r.status]}>{t[LABEL[r.status]]}</Badge>
      </div>
      <p className="mt-3 text-sm">
        {f({ weekday: "short", day: "numeric", month: "short" }).format(new Date(r.startAt))} ·{" "}
        {f(time).format(new Date(r.startAt))} – {f(time).format(new Date(r.endAt))}
        {r.playersCount ? ` · ${r.playersCount} ${t.playersN}` : ""}
      </p>
      {(r.status === "pending" || r.status === "confirmed") && (
        <div className="mt-3">
          {r.canCancel ? (
            <Button variant="secondary" size="sm" pending={pending} onClick={cancel}>
              {t.cancelBooking}
            </Button>
          ) : (
            <p className="text-xs text-muted">{t.cancelDeadlineHint}</p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

export function MyBookings({ reservations }: { reservations: MyReservation[] }) {
  return (
    <ul className="space-y-3">
      {reservations.map((r) => (
        <Row key={r.id} r={r} />
      ))}
    </ul>
  );
}
