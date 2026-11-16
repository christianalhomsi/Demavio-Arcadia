"use client";

import { CalendarCheck, ChevronRight, Gamepad2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
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

/** Block colours per reservation status. Each block also carries its status as text. */
const RES_STYLE: Record<string, string> = {
  pending: "bg-warning-bg text-warning border-warning/50 border-dashed",
  confirmed: "bg-info-bg text-info border-info/50",
  checked_in: "bg-success-bg text-success border-success/50",
  canceled: "hidden",
  no_show: "bg-warning-bg text-warning border-warning/40 opacity-70",
};
const RES_DOT: Record<string, string> = {
  pending: "bg-warning",
  confirmed: "bg-info",
  checked_in: "bg-success",
  no_show: "bg-warning/60",
};

type Item =
  | { kind: "res"; id: string; start: string; end: string; row: ReservationRow }
  | { kind: "ses"; id: string; start: string; end: string; row: SessionRow; running: boolean };

/**
 * The day at a glance, per device. Phones get an agenda (no sideways scrolling): a status line, a
 * full-width 24 hour strip and the day's bookings and sessions as large tappable rows. Wider screens get
 * the device x time timeline, which opens scrolled to "now". Every block is a link with a full text label,
 * so colour is never the only signal.
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
  const span = window.end.getTime() - window.start.getTime();
  const nowPos =
    now >= window.start && now < window.end
      ? ((now.getTime() - window.start.getTime()) / span) * 100
      : null;
  const time = (iso: string) => formatHallTime(iso, timeZone, "HH:mm");

  const itemsFor = (deviceId: string): Item[] => {
    const res: Item[] = reservations
      .filter((r) => r.deviceId === deviceId && r.status !== "canceled")
      .map((r) => ({ kind: "res", id: r.id, start: r.startAt, end: r.endAt, row: r }));
    const ses: Item[] = sessions
      .filter((s) => s.deviceId === deviceId)
      .map((s) => ({
        kind: "ses",
        id: s.id,
        start: s.startedAt,
        end: s.endedAt ?? s.scheduledEndAt ?? window.end.toISOString(),
        row: s,
        running: !s.endedAt,
      }));
    return [...res, ...ses].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  };

  const resLabel = (r: ReservationRow) =>
    tpl(t.rsAriaRes, {
      status: t[STATUS_KEYS[r.status]],
      customer: r.customerName ?? t.rsCustomerFallback,
      from: time(r.startAt),
      to: time(r.endAt),
    });
  const sesLabel = (s: SessionRow) =>
    tpl(s.endedAt ? t.rsSessionEnded : t.rsSessionRunning, {
      type: s.type === "fixed" ? t.cmTypeFixed : t.cmTypeOpen,
      from: time(s.startedAt),
      to: s.endedAt ? time(s.endedAt) : "",
    });
  const hrefOf = (it: Item) =>
    it.kind === "res"
      ? `/halls/${hallId}/reservations/${it.id}`
      : `/halls/${hallId}/sessions/${it.id}`;

  /** What the device is doing right now (only meaningful when the day shown is today). */
  const statusNow = (items: Item[]) => {
    if (nowPos === null) return null;
    const ms = now.getTime();
    const running = items.find((i) => i.kind === "ses" && i.running);
    if (running) {
      const s = running.row as SessionRow;
      return {
        tone: "busy" as const,
        text: s.scheduledEndAt
          ? tpl(t.rsBusyUntil, { time: time(s.scheduledEndAt) })
          : t.rsInSession,
      };
    }
    const held = items.find(
      (i) =>
        i.kind === "res" &&
        (i.row as ReservationRow).status !== "no_show" &&
        Date.parse(i.start) <= ms &&
        Date.parse(i.end) > ms,
    );
    if (held) return { tone: "busy" as const, text: tpl(t.rsBusyUntil, { time: time(held.end) }) };
    return { tone: "free" as const, text: t.rsAvailableNow };
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <Legend />

      {/* Phones: an agenda per device. */}
      <ul className="divide-y divide-border md:hidden">
        {devices.map((d) => {
          const items = itemsFor(d.id);
          const status = statusNow(items);
          return (
            <li key={d.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="truncate text-base font-semibold">{d.name}</h3>
                {status && <StatusChip tone={status.tone} text={status.text} />}
              </div>

              <DayStrip
                items={items}
                window={window}
                nowPos={nowPos}
                labels={ticks.filter((_, i) => i % 6 === 0)}
                ariaLabel={tpl(t.rsTimeline, { name: d.name })}
              />

              {items.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-border px-3 py-3 text-center text-sm text-muted">
                  {t.rsNothingToday}
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {items.map((it) => (
                    <li key={`${it.kind}-${it.id}`}>
                      <Link
                        href={hrefOf(it)}
                        aria-label={
                          it.kind === "res"
                            ? resLabel(it.row as ReservationRow)
                            : sesLabel(it.row as SessionRow)
                        }
                        className="group flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface-raised px-3 py-2.5 transition-colors hover:border-primary/50 active:bg-neutral-bg"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                            it.kind === "res"
                              ? RES_STYLE[(it.row as ReservationRow).status]
                              : it.kind === "ses" && it.running
                                ? "bg-primary/20 text-primary"
                                : "bg-neutral-bg text-muted",
                          )}
                        >
                          {it.kind === "res" ? (
                            <CalendarCheck className="h-4 w-4" />
                          ) : (
                            <Gamepad2 className="h-4 w-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {it.row.customerName ??
                              (it.kind === "res" ? t.rsReserved : t.rsSession)}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                            <span dir="ltr" className="tabular-nums">
                              {time(it.start)} –{" "}
                              {it.kind === "ses" &&
                              it.running &&
                              !(it.row as SessionRow).scheduledEndAt
                                ? "…"
                                : time(it.end)}
                            </span>
                            <span aria-hidden>·</span>
                            <span>
                              {it.kind === "res"
                                ? t[STATUS_KEYS[(it.row as ReservationRow).status]]
                                : it.running
                                  ? t.rsLegendRunning
                                  : t.rsLegendEnded}
                            </span>
                          </span>
                        </span>
                        <ChevronRight
                          aria-hidden
                          className="h-4 w-4 shrink-0 text-muted transition-transform group-active:translate-x-0.5 rtl:-scale-x-100"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {/* Wider screens: the device x time timeline. */}
      <Timeline
        devices={devices}
        ticks={ticks}
        nowPos={nowPos}
        nowLabel={nowPos === null ? "" : time(now.toISOString())}
        window={window}
        itemsFor={itemsFor}
        statusNow={statusNow}
        hrefOf={hrefOf}
        resLabel={resLabel}
        sesLabel={sesLabel}
        time={time}
      />

      <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
        {tpl(t.rsTimesIn, { tz: timeZone })}
      </p>
    </section>
  );
}

function Legend() {
  const { t } = useI18n();
  const entries: { cls: string; label: string }[] = [
    { cls: RES_DOT.confirmed, label: t[STATUS_KEYS.confirmed] },
    { cls: RES_DOT.pending, label: t[STATUS_KEYS.pending] },
    { cls: RES_DOT.checked_in, label: t[STATUS_KEYS.checked_in] },
    { cls: "bg-primary", label: t.rsLegendRunning },
    { cls: "bg-muted/50", label: t.rsLegendEnded },
  ];
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-3 text-xs text-muted">
      {entries.map((e) => (
        <li key={e.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", e.cls)} />
          {e.label}
        </li>
      ))}
    </ul>
  );
}

function StatusChip({ tone, text }: { tone: "free" | "busy"; text: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "free" ? "bg-success-bg text-success" : "bg-warning-bg text-warning",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "free" ? "bg-success" : "animate-pulse bg-warning motion-reduce:animate-none",
        )}
      />
      {text}
    </span>
  );
}

/** A full-width 24 hour bar for phones: where the day is booked, and where "now" is. */
function DayStrip({
  items,
  window,
  nowPos,
  labels,
  ariaLabel,
}: {
  items: Item[];
  window: { start: Date; end: Date };
  nowPos: number | null;
  labels: { label: string; left: number }[];
  ariaLabel: string;
}) {
  return (
    <div className="mt-3" aria-label={ariaLabel} role="img">
      <div dir="ltr" className="relative h-3 overflow-hidden rounded-full bg-neutral-bg">
        {items.map((it) => {
          const pos = blockPosition(it.start, it.end, window);
          if (!pos) return null;
          const cls =
            it.kind === "res"
              ? (RES_DOT[(it.row as ReservationRow).status] ?? "bg-info")
              : it.running
                ? "bg-primary"
                : "bg-muted/50";
          return (
            <span
              key={`${it.kind}-${it.id}`}
              className={cn("absolute inset-y-0 rounded-full", cls)}
              style={{ left: `${pos.left}%`, width: `max(${pos.width}%, 4px)` }}
            />
          );
        })}
        {nowPos !== null && (
          <span className="absolute inset-y-0 w-0.5 bg-danger" style={{ left: `${nowPos}%` }} />
        )}
      </div>
      <div dir="ltr" className="relative mt-1 h-4 text-[11px] tabular-nums text-muted">
        {labels.map((l) => (
          <span
            key={l.left}
            className="absolute first:translate-x-0 -translate-x-1/2"
            style={{ left: `${l.left}%` }}
          >
            {l.label}
          </span>
        ))}
        <span className="absolute right-0">24</span>
      </div>
    </div>
  );
}

function Timeline({
  devices,
  ticks,
  nowPos,
  nowLabel,
  window,
  itemsFor,
  statusNow,
  hrefOf,
  resLabel,
  sesLabel,
  time,
}: {
  devices: CalendarDevice[];
  ticks: { label: string; left: number }[];
  nowPos: number | null;
  nowLabel: string;
  window: { start: Date; end: Date };
  itemsFor: (deviceId: string) => Item[];
  statusNow: (items: Item[]) => { tone: "free" | "busy"; text: string } | null;
  hrefOf: (it: Item) => string;
  resLabel: (r: ReservationRow) => string;
  sesLabel: (s: SessionRow) => string;
  time: (iso: string) => string;
}) {
  const { t } = useI18n();
  const nowRef = React.useRef<HTMLDivElement>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  // Open on "now" (or the first booking) instead of midnight, without moving the page vertically.
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    const target = nowRef.current ?? scroller?.querySelector<HTMLElement>("[data-block]");
    if (!scroller || !target) return;
    const s = scroller.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    // Centre it in the part of the box the pinned device column does not cover.
    const col = scroller.querySelector<HTMLElement>("[data-device-col]")?.getBoundingClientRect();
    const free =
      col && col.left > s.left + s.width / 2
        ? { from: s.left, to: col.left } // column on the right (RTL)
        : { from: col ? col.right : s.left, to: s.right };
    scroller.scrollLeft += r.left - (free.from + free.to) / 2;
  }, []);

  return (
    <div ref={scrollerRef} className="hidden overflow-x-auto md:block">
      {/* 11rem device column + 24 hours x 4rem, so a one hour booking can show its name and time. */}
      <div className="min-w-[107rem]">
        <div className="sticky top-0 z-20 grid grid-cols-[11rem_1fr] border-b border-border bg-surface text-xs text-muted">
          <div data-device-col className="sticky start-0 z-30 bg-surface px-4 py-2.5 font-medium">
            {t.colDevice}
          </div>
          <div dir="ltr" className="relative h-9" aria-hidden>
            {ticks.map((tk, i) => (
              <span
                key={i}
                className={cn(
                  "absolute top-2.5 -translate-x-1/2 tabular-nums",
                  i % 3 === 0 ? "font-semibold text-foreground/80" : "",
                )}
                style={{ left: `${tk.left}%` }}
              >
                {tk.label}
              </span>
            ))}
            {nowPos !== null && (
              <span
                className="absolute top-1.5 z-10 -translate-x-1/2 rounded-full bg-danger px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white"
                style={{ left: `${nowPos}%` }}
              >
                {nowLabel}
              </span>
            )}
          </div>
        </div>

        {devices.map((d) => {
          const items = itemsFor(d.id);
          const status = statusNow(items);
          return (
            <div
              key={d.id}
              className="grid grid-cols-[11rem_1fr] border-b border-border last:border-0"
            >
              <div className="sticky start-0 z-10 flex flex-col justify-center gap-1 bg-surface px-4 py-3">
                <span className="truncate text-sm font-semibold">{d.name}</span>
                {status && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs",
                      status.tone === "free" ? "text-success" : "text-warning",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        status.tone === "free" ? "bg-success" : "bg-warning",
                      )}
                    />
                    {status.text}
                  </span>
                )}
              </div>
              <ul
                dir="ltr"
                aria-label={tpl(t.rsTimeline, { name: d.name })}
                className="relative h-[4.5rem]"
              >
                {ticks.map((tk, i) => (
                  <li
                    key={i}
                    aria-hidden
                    className={cn(
                      "absolute inset-y-0 border-l",
                      i % 3 === 0 ? "border-border" : "border-border/40",
                      i % 2 === 1 && "bg-foreground/[0.015]",
                    )}
                    style={{ left: `${tk.left}%`, width: `${100 / ticks.length}%` }}
                  />
                ))}
                {items.map((it) => {
                  const pos = blockPosition(it.start, it.end, window);
                  if (!pos) return null;
                  if (it.kind === "res") {
                    const r = it.row as ReservationRow;
                    return (
                      <li
                        key={`res-${r.id}`}
                        data-block
                        className="absolute top-2 h-10"
                        style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                      >
                        <Link
                          href={hrefOf(it)}
                          aria-label={resLabel(r)}
                          title={resLabel(r)}
                          className={cn(
                            "flex h-full flex-col justify-center overflow-hidden rounded-lg border px-2 transition-[filter] hover:brightness-125 focus-visible:ring-2 focus-visible:ring-ring",
                            RES_STYLE[r.status],
                          )}
                        >
                          <span className="truncate text-xs font-semibold leading-4">
                            {r.customerName ?? t.rsReserved}
                          </span>
                          <span className="truncate text-[11px] leading-4 tabular-nums opacity-80">
                            {time(r.startAt)}–{time(r.endAt)}
                          </span>
                        </Link>
                      </li>
                    );
                  }
                  const s = it.row as SessionRow;
                  return (
                    <li
                      key={`ses-${s.id}`}
                      data-block
                      className="absolute bottom-2 h-2.5"
                      style={{ left: `${pos.left}%`, width: `max(${pos.width}%, 6px)` }}
                    >
                      <Link
                        href={hrefOf(it)}
                        aria-label={sesLabel(s)}
                        title={sesLabel(s)}
                        className={cn(
                          "block h-full rounded-full focus-visible:ring-2 focus-visible:ring-ring",
                          it.running
                            ? "bg-primary shadow-[0_0_10px] shadow-primary/60"
                            : "bg-muted/50",
                        )}
                      />
                    </li>
                  );
                })}
                {nowPos !== null && (
                  <li
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-danger"
                    style={{ left: `${nowPos}%` }}
                  >
                    <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-danger" />
                  </li>
                )}
              </ul>
            </div>
          );
        })}
        {nowPos !== null && (
          // Anchor the scroll-to-now effect on the time line.
          <div dir="ltr" className="grid grid-cols-[11rem_1fr]" aria-hidden>
            <div />
            <div className="relative h-0">
              <div ref={nowRef} className="absolute" style={{ left: `${nowPos}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
