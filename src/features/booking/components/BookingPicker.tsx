"use client";

import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { formatLocale, type Locale, type Messages } from "@/lib/i18n/messages";
import { shiftDate } from "@/lib/dayWindow";
import { newIdempotencyKey } from "@/lib/idempotency";
import { formatMoney } from "@/lib/money";
import { createPlayerReservationAction, quotePriceAction } from "../actions";
import type { Quote } from "../queries";
import {
  buildSlots,
  DURATIONS,
  MAX_SLOTS,
  monthGrid,
  type Interval,
  type Range,
  type WorkingRange,
} from "../slots";

// Any Sunday: its 7 successors are the weekday columns, Sunday first.
const WEEKDAY_BASE = Array.from({ length: 7 }, (_, i) => Date.UTC(2026, 10, 1 + i));

function fmt(
  value: string | number,
  timeZone: string,
  locale: Locale,
  o: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(formatLocale(locale), { timeZone, ...o }).format(new Date(value));
}
const HM: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

const durationLabel = (ms: number, t: Messages) => {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} ${t.min}`;
  return m % 60 === 0
    ? `${m / 60} ${t.hour}`
    : `${Math.floor(m / 60)} ${t.hour} ${m % 60} ${t.min}`;
};

export interface BookingPickerProps {
  deviceId: string;
  hallName: string;
  deviceName: string;
  timeZone: string;
  currency: string;
  /** Selected day (YYYY-MM-DD, hall zone) and today in the same zone. */
  date: string;
  today: string;
  /** Server time when rendered; slots in the past are disabled relative to it. */
  nowMs: number;
  hours: WorkingRange[];
  busy: Interval[];
  /** Player counts this device is priced by (e.g. [2, 4]); empty = flat priced. */
  playerOptions: number[];
  signedIn: boolean;
  initialStart?: string;
  initialEnd?: string;
  initialPlayers?: number;
}

export function BookingPicker(props: BookingPickerProps) {
  const { deviceId, hallName, deviceName, timeZone, currency, date, today, nowMs, hours, busy } =
    props;
  const { playerOptions } = props;
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [calendar, setCalendar] = React.useState(false);
  const [navPending, startNav] = React.useTransition();
  const [booking, startBooking] = React.useTransition();

  const [view, setView] = React.useState(() => ({
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
  }));
  const [players, setPlayers] = React.useState<number | null>(
    playerOptions.length === 0
      ? null
      : playerOptions.includes(props.initialPlayers ?? -1)
        ? (props.initialPlayers as number)
        : (playerOptions[0] ?? null),
  );
  const [range, setRange] = React.useState<Range | null>(() => {
    const s = props.initialStart ? Date.parse(props.initialStart) : NaN;
    const e = props.initialEnd ? Date.parse(props.initialEnd) : NaN;
    return Number.isNaN(s) || Number.isNaN(e) ? null : { start: s, end: e };
  });
  const [quoted, setQuoted] = React.useState<{ sig: string; quote: Quote } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<Range | null>(null);
  const keyRef = React.useRef<{ sig: string; key: string } | null>(null);

  // Every slot is one 30 minute cell; a range is valid only while all its cells are still free.
  const slots = React.useMemo(
    () => buildSlots({ date, timeZone, hours, busy, now: nowMs, durationMin: 30 }),
    [date, timeZone, hours, busy, nowMs],
  );
  const selected = React.useMemo(() => {
    if (!range) return null;
    const cells = slots.filter((s) => {
      const x = Date.parse(s.startIso);
      return x >= range.start && x < range.end;
    });
    const expected = (range.end - range.start) / (30 * 60_000);
    return cells.length === expected && cells.every((s) => s.available) ? range : null;
  }, [range, slots]);
  const startIso = selected ? new Date(selected.start).toISOString() : null;
  const endIso = selected ? new Date(selected.end).toISOString() : null;

  // Estimate only: the hall's real charge always comes from the finished session. The answer is keyed
  // by the selection it was asked for, so a stale answer is never shown for a newer selection.
  const quoteSig = startIso && endIso ? `${startIso}|${endIso}|${players}` : null;
  React.useEffect(() => {
    if (!quoteSig || !startIso || !endIso) return;
    let cancelled = false;
    void quotePriceAction(deviceId, startIso, endIso, players).then((r) => {
      if (!cancelled && r.ok) setQuoted({ sig: quoteSig, quote: r.data });
    });
    return () => {
      cancelled = true;
    };
  }, [deviceId, quoteSig, startIso, endIso, players]);
  const quote = quoted && quoted.sig === quoteSig ? quoted.quote : null;

  const weeks = monthGrid(view.year, view.month);
  const todayMonth = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  const atFirstMonth = view.year === todayMonth.year && view.month === todayMonth.month;
  function stepMonth(delta: number) {
    setView((v) => {
      const idx = v.year * 12 + (v.month - 1) + delta;
      return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
    });
  }

  function pickDay(d: string) {
    setError(null);
    setRange(null);
    startNav(() => router.push(`${pathname}?date=${d}`));
  }

  // The next three weeks as one swipeable row; anything further away is in the calendar.
  const strip = React.useMemo(
    () => Array.from({ length: 21 }, (_, i) => shiftDate(today, i)),
    [today],
  );
  const rel = React.useMemo(
    () => new Intl.RelativeTimeFormat(formatLocale(locale), { numeric: "auto" }),
    [locale],
  );
  const stripRef = React.useRef<HTMLUListElement>(null);
  React.useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  /** True when every 30 minute cell from `start` for `minutes` is free. */
  const fits = React.useCallback(
    (start: number, minutes: number) => {
      const need = minutes / 30;
      if (need > MAX_SLOTS) return false;
      const free = new Map(slots.map((s) => [Date.parse(s.startIso), s.available]));
      for (let i = 0; i < need; i++) if (!free.get(start + i * 30 * 60_000)) return false;
      return true;
    },
    [slots],
  );
  const minutesNow = selected ? (selected.end - selected.start) / 60_000 : 60;

  function pickStart(x: number) {
    setError(null);
    if (selected && selected.start === x) return setRange(null);
    // Keep the length the player had chosen, shrinking only when the time after it is taken.
    const want = [...DURATIONS].reverse().find((m) => m <= minutesNow && fits(x, m)) ?? 30;
    setRange({ start: x, end: x + want * 60_000 });
  }
  function pickDuration(m: number) {
    if (!selected) return;
    setError(null);
    setRange({ start: selected.start, end: selected.start + m * 60_000 });
  }

  function reserve() {
    if (!startIso || !endIso) return;
    setError(null);
    if (!props.signedIn) {
      // Browsing is public; booking needs an account. Come back to this exact selection afterwards.
      const back =
        `${pathname}?date=${date}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}` +
        (players ? `&players=${players}` : "");
      router.push(`/login?next=${encodeURIComponent(back)}`);
      return;
    }
    // One key per intent: reused for retries of the same choice, new when the choice changes.
    const sig = `${startIso}|${endIso}|${players}`;
    if (keyRef.current?.sig !== sig) keyRef.current = { sig, key: newIdempotencyKey() };
    const key = keyRef.current.key;
    startBooking(async () => {
      const r = await createPlayerReservationAction(deviceId, startIso, endIso, key, players);
      if (r.ok) {
        setDone({ start: Date.parse(startIso), end: Date.parse(endIso) });
        return;
      }
      setError(
        r.code === "UNAUTHENTICATED"
          ? t.errSession
          : r.code === "CONFLICT"
            ? t.errUnavailable
            : r.code === "PRECONDITION_FAILED"
              ? r.message.toLowerCase().includes("bookings")
                ? t.errTooMany
                : t.errUnavailable
              : r.code === "VALIDATION" && r.fieldErrors?.players
                ? t.errPlayers
                : t.errGeneric,
      );
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="mt-6 rounded-3xl border border-border bg-surface p-6 text-center shadow-card">
        <CircleCheck className="mx-auto h-12 w-12 text-success" aria-hidden />
        <h2 className="mt-3 text-xl font-semibold">{t.requestSent}</h2>
        <p className="mt-1 text-sm text-muted">
          {deviceName} · {hallName}
        </p>
        <p className="mt-3 text-lg font-semibold tabular-nums">
          {fmt(done.start, timeZone, locale, {
            weekday: "short",
            day: "numeric",
            month: "short",
            ...HM,
          })}{" "}
          – {fmt(done.end, timeZone, locale, HM)}
        </p>
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted">{t.requestSentBody}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/reservations">{t.myBookings}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">{t.backToHalls}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const money = (minor: number, cur: string) => formatMoney(minor, cur, formatLocale(locale));
  const visible = slots.filter((s) => s.state !== "past");
  const stepTitle = "flex items-center gap-2 text-sm font-semibold";
  const stepNo =
    "grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-xs font-bold text-accent";

  return (
    <div className="mt-5 space-y-6">
      <div className="min-w-0 space-y-6 pb-0">
        {playerOptions.length > 0 && (
          <section aria-label={t.players}>
            <h2 className={stepTitle}>
              <span className={stepNo}>1</span>
              {t.players}
            </h2>
            <div className="mt-3 grid max-w-sm grid-cols-2 gap-2">
              {playerOptions.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={players === n}
                  onClick={() => setPlayers(n)}
                  className={cn(
                    "h-12 cursor-pointer rounded-xl border-2 text-sm font-medium transition-colors",
                    players === n
                      ? "border-primary bg-primary/15 text-accent"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  {n} {t.playersN}
                </button>
              ))}
            </div>
          </section>
        )}

        <section aria-label={t.chooseDay}>
          <div className="flex items-center justify-between gap-2">
            <h2 className={stepTitle}>
              <span className={stepNo}>{playerOptions.length > 0 ? 2 : 1}</span>
              {t.chooseDay}
            </h2>
            <button
              type="button"
              aria-expanded={calendar}
              onClick={() => setCalendar((v) => !v)}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl px-2 text-sm text-accent hover:bg-neutral-bg"
            >
              <CalendarDays className="h-4 w-4" aria-hidden />
              {calendar ? t.bookHideCalendar : t.bookMoreDates}
            </button>
          </div>

          <ul
            ref={stripRef}
            className="-mx-4 mt-3 flex snap-x gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {strip.map((d, i) => {
              const on = d === date;
              return (
                <li key={d} className="snap-start">
                  <button
                    type="button"
                    disabled={navPending}
                    aria-pressed={on}
                    aria-label={d}
                    onClick={() => pickDay(d)}
                    className={cn(
                      "flex h-[4.5rem] w-16 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface hover:border-primary/50",
                    )}
                  >
                    <span className={cn("text-xs", on ? "opacity-90" : "text-muted")}>
                      {i < 2
                        ? rel.format(i, "day")
                        : fmt(`${d}T12:00:00Z`, "UTC", locale, { weekday: "short" })}
                    </span>
                    <span className="text-xl font-bold tabular-nums">{Number(d.slice(8))}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {calendar && (
            <div className="mt-2 rounded-2xl border border-border bg-surface p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t.prevMonth}
                  disabled={atFirstMonth}
                  onClick={() => stepMonth(-1)}
                >
                  <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
                </Button>
                <h3 className="text-sm font-semibold">
                  {fmt(Date.UTC(view.year, view.month - 1, 1), "UTC", locale, {
                    month: "long",
                    year: "numeric",
                  })}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t.nextMonth}
                  onClick={() => stepMonth(1)}
                >
                  <ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
                </Button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
                {WEEKDAY_BASE.map((d) => (
                  <div key={d} className="py-1">
                    {fmt(d, "UTC", locale, { weekday: "narrow" })}
                  </div>
                ))}
                {weeks.flat().map((d, i) =>
                  d ? (
                    <button
                      key={d}
                      type="button"
                      disabled={d < today || navPending}
                      aria-pressed={d === date}
                      aria-label={d}
                      onClick={() => {
                        setCalendar(false);
                        pickDay(d);
                      }}
                      className={cn(
                        "h-11 cursor-pointer rounded-lg text-sm tabular-nums transition-colors",
                        "disabled:cursor-not-allowed disabled:opacity-30",
                        d === date
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-neutral-bg",
                        d === today && d !== date && "ring-1 ring-accent",
                      )}
                    >
                      {Number(d.slice(8))}
                    </button>
                  ) : (
                    <div key={`pad-${i}`} />
                  ),
                )}
              </div>
            </div>
          )}
        </section>

        <section aria-label={t.chooseTime}>
          <h2 className={stepTitle}>
            <span className={stepNo}>{playerOptions.length > 0 ? 3 : 2}</span>
            {t.bookStartTime}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {fmt(`${date}T12:00:00Z`, "UTC", locale, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <div className={cn("mt-3", navPending && "opacity-60")} aria-busy={navPending}>
            {visible.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted">
                {hallName} {t.closed}
              </p>
            ) : (
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                {visible.map((s) => {
                  const x = Date.parse(s.startIso);
                  const isStart = selected?.start === x;
                  const inRange = Boolean(selected && x >= selected.start && x < selected.end);
                  return (
                    <li key={s.startIso}>
                      <button
                        type="button"
                        disabled={!s.available}
                        aria-pressed={inRange}
                        aria-label={`${s.label} ${s.available ? t.slotAvailable : t.slotBooked}`}
                        onClick={() => pickStart(x)}
                        className={cn(
                          "h-12 w-full cursor-pointer rounded-xl border-2 text-sm font-semibold tabular-nums transition-colors",
                          "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-neutral-bg disabled:text-muted/60 disabled:line-through",
                          isStart
                            ? "border-primary bg-primary text-primary-foreground"
                            : inRange
                              ? "border-primary/60 bg-primary/20 text-accent"
                              : "border-border bg-surface hover:border-primary/60",
                        )}
                      >
                        {s.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selected && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">{t.bookDuration}</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {DURATIONS.map((m) => {
                  const ok = fits(selected.start, m);
                  return (
                    <li key={m}>
                      <button
                        type="button"
                        disabled={!ok}
                        aria-pressed={minutesNow === m}
                        onClick={() => pickDuration(m)}
                        className={cn(
                          "h-11 min-w-16 cursor-pointer rounded-full border-2 px-4 text-sm font-medium transition-colors",
                          "disabled:cursor-not-allowed disabled:opacity-35",
                          minutesNow === m
                            ? "border-primary bg-primary/15 text-accent"
                            : "border-border hover:border-primary/50",
                        )}
                      >
                        {durationLabel(m * 60_000, t)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>

      <aside
        aria-label={t.reserve}
        className={cn(
          "z-30 rounded-3xl border border-border bg-surface/95 p-4 shadow-float backdrop-blur",
          "mx-auto w-full max-w-xl",
        )}
      >
        {selected && startIso && endIso ? (
          <div>
            <p className="text-xs text-muted">
              {deviceName} · {hallName}
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">
              {fmt(startIso, timeZone, locale, HM)} – {fmt(endIso, timeZone, locale, HM)}
            </p>
            <p className="text-sm text-muted">
              {durationLabel(selected.end - selected.start, t)}
              {players ? ` · ${players} ${t.playersN}` : ""}
            </p>
            {quote && quote.ratePerHourMinor > 0 && (
              <p className="mt-1 text-sm text-muted">
                {t.estimate}:{" "}
                <span className="font-semibold text-foreground">
                  {money(quote.estimatedMinor, quote.currency || currency)}
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">{t.pickPrompt}</p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <Button
          className="mt-3 h-12 w-full"
          disabled={!selected}
          pending={booking}
          onClick={reserve}
        >
          {props.signedIn ? t.reserve : t.signInToReserve}
        </Button>
        {!props.signedIn && <p className="mt-2 text-xs text-muted">{t.accountLastStep}</p>}
      </aside>
    </div>
  );
}
