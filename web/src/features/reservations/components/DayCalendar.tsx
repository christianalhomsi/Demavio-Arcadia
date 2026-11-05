"use client";

import Link from "next/link";
import { blockPosition, hourTicks } from "@/lib/dayWindow";
import { formatHallTime } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import type { SessionRow } from "@/features/sessions/queries";
import type { ReservationRow } from "../queries";
import { STATUS_KEYS } from "../schemas";

export interface CalendarDevice {
  id: string;
  name: string;
}

const RES_STYLE: Record<string, string> = {
  pending: "bg-warning-bg text-warning border-warning/40 border-dashed",
  confirmed: "bg-info-bg text-info border-info/40",
  checked_in: "bg-success-bg text-success border-success/40",
  canceled: "hidden",
  no_show: "bg-warning-bg text-warning border-warning/40 opacity-70",
};

/**
 * One-day timeline: a row per device, time across. Blocks are links, so the calendar is fully
 * keyboard-reachable; each block's text label carries the same meaning as its colour.
 */
export function DayCalendar({
  hallId,
  timeZone,
  window,
  devices,
  reservations,
  sessions,
  now = new Date(),
}: {
  hallId: string;
  timeZone: string;
  window: { start: Date; end: Date };
  devices: CalendarDevice[];
  reservations: ReservationRow[];
  sessions: SessionRow[];
  now?: Date;
}) {
  const { t } = useI18n();
  const ticks = hourTicks(window, timeZone);
  const nowPos =
    now >= window.start && now < window.end
      ? ((now.getTime() - window.start.getTime()) /
          (window.end.getTime() - window.start.getTime())) *
        100
      : null;
  const time = (iso: string) => formatHallTime(iso, timeZone, "HH:mm");

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
      <div className="min-w-[56rem]">
        <div className="grid grid-cols-[8rem_1fr] border-b border-border text-xs text-muted">
          <div className="px-3 py-2">{t.colDevice}</div>
          <div dir="ltr" className="relative h-8" aria-hidden>
            {ticks.map((t, i) => (
              <span
                key={i}
                className="absolute top-2 -translate-x-1/2"
                style={{ left: `${t.left}%` }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>

        {devices.map((d) => {
          const res = reservations.filter((r) => r.deviceId === d.id && r.status !== "canceled");
          const sess = sessions.filter((s) => s.deviceId === d.id);
          return (
            <div
              key={d.id}
              className="grid grid-cols-[8rem_1fr] border-b border-border last:border-0"
            >
              <div className="truncate px-3 py-3 text-sm font-medium">{d.name}</div>
              <ul
                dir="ltr"
                aria-label={tpl(t.rsTimeline, { name: d.name })}
                className="relative h-12"
              >
                {ticks.map((t, i) => (
                  <li
                    key={i}
                    aria-hidden
                    className="absolute inset-y-0 border-l border-border/60"
                    style={{ left: `${t.left}%` }}
                  />
                ))}
                {nowPos !== null && (
                  <li
                    aria-hidden
                    className="absolute inset-y-0 z-10 border-l-2 border-danger"
                    style={{ left: `${nowPos}%` }}
                  />
                )}
                {res.map((r) => {
                  const pos = blockPosition(r.startAt, r.endAt, window);
                  if (!pos) return null;
                  return (
                    <li
                      key={r.id}
                      className="absolute inset-y-1"
                      style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                    >
                      <Link
                        href={`/halls/${hallId}/reservations/${r.id}`}
                        aria-label={tpl(t.rsAriaRes, {
                          status: t[STATUS_KEYS[r.status]],
                          customer: r.customerName ?? t.rsCustomerFallback,
                          from: time(r.startAt),
                          to: time(r.endAt),
                        })}
                        className={cn(
                          "block h-full overflow-hidden rounded border px-1 text-xs leading-5",
                          RES_STYLE[r.status],
                        )}
                      >
                        {r.customerName ?? t.rsReserved} · {t[STATUS_KEYS[r.status]]}
                      </Link>
                    </li>
                  );
                })}
                {sess.map((s) => {
                  const pos = blockPosition(
                    s.startedAt,
                    s.endedAt ?? s.scheduledEndAt ?? window.end.toISOString(),
                    window,
                  );
                  if (!pos) return null;
                  return (
                    <li
                      key={s.id}
                      className="absolute bottom-0 h-3"
                      style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                    >
                      <Link
                        href={`/halls/${hallId}/sessions/${s.id}`}
                        aria-label={tpl(s.endedAt ? t.rsSessionEnded : t.rsSessionRunning, {
                          type: s.type === "fixed" ? t.cmTypeFixed : t.cmTypeOpen,
                          from: time(s.startedAt),
                          to: s.endedAt ? time(s.endedAt) : "",
                        })}
                        className={cn(
                          "block h-full rounded-sm",
                          s.endedAt ? "bg-neutral-bg" : "bg-primary",
                        )}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="border-t border-border px-3 py-2 text-xs text-muted">
        {tpl(t.rsLegend, { tz: timeZone })}
      </p>
    </div>
  );
}
