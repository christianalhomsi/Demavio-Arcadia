"use client";

import { ChevronLeft, ChevronRight, CircleCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { formatLocale, type Locale, type Messages } from "@/lib/i18n/messages";
import { newIdempotencyKey } from "@/lib/idempotency";
import { formatMoney } from "@/lib/money";
import { createPlayerReservationAction, quotePriceAction } from "../actions";
import type { Quote } from "../queries";
import {
  buildSlots,
  monthGrid,
  pickRange,
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
      <div className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center shadow-card">
        <CircleCheck className="mx-auto h-10 w-10 text-success" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold">{t.requestSent}</h2>
        <p className="mt-1 text-sm text-muted">
          {deviceName} · {hallName}
        </p>
        <p className="mt-2 font-medium">
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

  return (
    <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,20rem)_1fr]">
      <section
        aria-label={t.chooseDay}
        className="rounded-2xl border border-border bg-surface p-4 shadow-card"
      >
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
          <h2 className="text-sm font-semibold">
            {fmt(Date.UTC(view.year, view.month - 1, 1), "UTC", locale, {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <Button variant="ghost" size="sm" aria-label={t.nextMonth} onClick={() => stepMonth(1)}>
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
                onClick={() => pickDay(d)}
                className={cn(
                  "h-10 cursor-pointer rounded-lg text-sm transition-colors",
                  "disabled:cursor-not-allowed disabled:opacity-30",
                  d === date ? "bg-primary text-primary-foreground" : "hover:bg-neutral-bg",
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
      </section>

      <section
        aria-label={t.chooseTime}
        className="rounded-2xl border border-border bg-surface p-4 shadow-card"
      >
        <h2 className="text-sm font-semibold">
          {fmt(`${date}T12:00:00Z`, "UTC", locale, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </h2>

        {playerOptions.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-sm text-muted">{t.players}</p>
            <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
              {playerOptions.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={players === n}
                  onClick={() => setPlayers(n)}
                  className={cn(
                    "h-11 cursor-pointer rounded-lg border-2 text-sm font-medium transition-colors",
                    players === n
                      ? "border-primary bg-primary/15 text-accent"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  {n} {t.playersN}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-sm text-muted">{t.rangeHint}</p>
        <div className={cn("mt-3", navPending && "opacity-60")} aria-busy={navPending}>
          {slots.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              {hallName} {t.closed}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {slots.map((s) => {
                const x = Date.parse(s.startIso);
                const inRange = Boolean(selected && x >= selected.start && x < selected.end);
                return (
                  <li key={s.startIso}>
                    <button
                      type="button"
                      disabled={!s.available}
                      aria-pressed={inRange}
                      onClick={() => setRange((cur) => pickRange(cur, x, slots))}
                      className={cn(
                        "flex h-14 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 transition-colors",
                        "disabled:cursor-not-allowed disabled:opacity-40",
                        inRange
                          ? "border-primary bg-primary/15"
                          : "border-border hover:border-primary/60 hover:bg-primary/5",
                      )}
                    >
                      <span className={cn("text-sm font-bold", inRange && "text-accent")}>
                        {s.label}
                      </span>
                      <span className="text-[10px] text-muted">
                        {s.state === "available"
                          ? t.slotAvailable
                          : s.state === "past"
                            ? t.slotPast
                            : t.slotBooked}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-5 border-t border-border pt-4">
          {selected && startIso && endIso ? (
            <div className="space-y-1 text-sm">
              <p>
                {deviceName} · {fmt(startIso, timeZone, locale, HM)} –{" "}
                {fmt(endIso, timeZone, locale, HM)} (
                {durationLabel(selected.end - selected.start, t)})
                {players ? ` · ${players} ${t.playersN}` : ""}
              </p>
              {quote && quote.ratePerHourMinor > 0 && (
                <p className="text-muted">
                  {t.estimate}:{" "}
                  <span className="font-semibold text-foreground">
                    {money(quote.estimatedMinor, quote.currency || currency)}
                  </span>{" "}
                  ({money(quote.ratePerHourMinor, quote.currency || currency)} {t.perHour})
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
            className="mt-3 w-full sm:w-auto"
            disabled={!selected}
            pending={booking}
            onClick={reserve}
          >
            {props.signedIn ? t.reserve : t.signInToReserve}
          </Button>
          {!props.signedIn && <p className="mt-2 text-xs text-muted">{t.accountLastStep}</p>}
        </div>
      </section>
    </div>
  );
}
