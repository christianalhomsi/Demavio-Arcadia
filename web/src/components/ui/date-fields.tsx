"use client";

import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  isValid,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { formatLocale } from "@/lib/i18n/messages";
import { applyMorph } from "@/lib/ui/morph";

/**
 * Date and time fields in the site's own style, replacing the browser's pickers (which cannot be
 * themed). Values use the same strings as the native inputs: "yyyy-MM-dd", "HH:mm" and
 * "yyyy-MM-ddTHH:mm", so forms and actions are unchanged.
 */

const ISO = "yyyy-MM-dd";
/** Fixed reference date: nothing may read the clock while rendering (pages are prerendered). */
const REF = new Date(2000, 0, 1);
const parseDate = (v: string): Date | null => {
  if (!v) return null;
  const d = parse(v.slice(0, 10), ISO, REF);
  return isValid(d) ? d : null;
};

const controlCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm " +
  "transition-colors focus-visible:border-primary disabled:opacity-50 aria-[invalid=true]:border-danger";

interface A11y {
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-label"?: string;
}

export function DateField({
  value: controlled,
  defaultValue = "",
  onChange,
  name,
  disabled,
  clearable,
  placeholder,
  className,
  ...a11y
}: A11y & {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Form field name: a hidden input carries the value for plain HTML forms. */
  name?: string;
  disabled?: boolean;
  /** Offer a "Clear" button (optional dates). */
  clearable?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const fmt = formatLocale(locale);
  const [inner, setInner] = React.useState(defaultValue);
  const value = controlled ?? inner;
  const date = parseDate(value);
  const set = (v: string) => {
    if (controlled === undefined) setInner(v);
    onChange?.(v);
  };

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0, width: 320 });
  const [month, setMonth] = React.useState(() => startOfMonth(date ?? REF));
  const [focused, setFocused] = React.useState<Date>(() => date ?? REF);
  // The current day is read when the calendar opens, never during render.
  const [today, setToday] = React.useState<Date | null>(null);

  const weekStartsOn = locale === "ar" ? 6 : 0;

  const originRef = React.useRef<DOMRect | null>(null);
  // Once the calendar is open and placed, it grows out of the field that opened it.
  React.useLayoutEffect(() => {
    if (open && popRef.current) applyMorph(popRef.current, originRef.current);
  }, [open]);

  function openPicker() {
    const el = triggerRef.current;
    const pop = popRef.current;
    if (!el || !pop || disabled) return;
    const now = new Date();
    const base = date ?? now;
    setToday(now);
    setMonth(startOfMonth(base));
    setFocused(base);
    const r = el.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const height = 372;
    const left = Math.min(
      Math.max(8, r.left + r.width / 2 - width / 2),
      window.innerWidth - width - 8,
    );
    const below = r.bottom + 6;
    const top = below + height > window.innerHeight ? Math.max(8, r.top - height - 6) : below;
    setPos({ top, left, width });
    originRef.current = r;
    pop.dataset.morph = "pending";
    pop.showPopover();
  }
  function close() {
    popRef.current?.hidePopover();
    triggerRef.current?.focus();
  }
  function pick(d: Date) {
    set(format(d, ISO));
    close();
  }
  function move(d: Date) {
    setFocused(d);
    if (!isSameMonth(d, month)) setMonth(startOfMonth(d));
  }

  // Keep keyboard focus on the focused day while the calendar is open.
  React.useEffect(() => {
    if (!open) return;
    popRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${format(focused, ISO)}"]`)
      ?.focus();
  }, [open, focused, month]);

  function onGridKey(e: React.KeyboardEvent) {
    const rtl = document.documentElement.dir === "rtl";
    const step = (days: number) => {
      e.preventDefault();
      move(addDays(focused, days));
    };
    switch (e.key) {
      case "ArrowLeft":
        return step(rtl ? 1 : -1);
      case "ArrowRight":
        return step(rtl ? -1 : 1);
      case "ArrowUp":
        return step(-7);
      case "ArrowDown":
        return step(7);
      case "PageUp":
        e.preventDefault();
        return move(addMonths(focused, -1));
      case "PageDown":
        e.preventDefault();
        return move(addMonths(focused, 1));
      case "Home":
        e.preventDefault();
        return move(startOfWeek(focused, { weekStartsOn }));
      case "End":
        e.preventDefault();
        return move(addDays(startOfWeek(focused, { weekStartsOn }), 6));
    }
  }

  const monthTitle = new Intl.DateTimeFormat(fmt, { month: "long", year: "numeric" }).format(month);
  const first = startOfWeek(startOfMonth(month), { weekStartsOn });
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const weekday = new Intl.DateTimeFormat(fmt, { weekday: "narrow" });
  const weekdayLong = new Intl.DateTimeFormat(fmt, { weekday: "long" });
  const dayLabel = new Intl.DateTimeFormat(fmt, { dateStyle: "full" });
  const shown = date
    ? new Intl.DateTimeFormat(fmt, { day: "numeric", month: "short", year: "numeric" }).format(date)
    : (placeholder ?? t.dpPick);

  const nav =
    "grid h-10 w-10 cursor-pointer place-items-center rounded-xl text-accent transition-colors hover:bg-neutral-bg active:bg-neutral-bg";

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={triggerRef}
        type="button"
        id={a11y.id}
        aria-label={a11y["aria-label"]}
        aria-invalid={a11y["aria-invalid"]}
        aria-describedby={a11y["aria-describedby"]}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={openPicker}
        className={cn(
          controlCls,
          "flex cursor-pointer items-center justify-between gap-2 text-start disabled:cursor-not-allowed",
          !date && "text-muted",
          className,
        )}
      >
        <span className="truncate tabular-nums">{shown}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      </button>

      <div
        ref={popRef}
        popover="auto"
        role="dialog"
        aria-label={t.dpPick}
        onToggle={(e) => setOpen((e.nativeEvent as ToggleEvent).newState === "open")}
        style={{
          position: "fixed",
          inset: "auto",
          top: pos.top,
          left: pos.left,
          width: pos.width,
          margin: 0,
        }}
        className="morph-pop rounded-2xl border border-primary/50 bg-surface p-3 text-foreground shadow-[0_12px_32px_-8px_rgb(0_0_0/0.7)]"
      >
        {open && (
          <>
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label={t.dpPrev}
                className={nav}
                onClick={() => setMonth(addMonths(month, -1))}
              >
                <ChevronLeft className="h-5 w-5 rtl:-scale-x-100" aria-hidden />
              </button>
              <span className="text-sm font-semibold" aria-live="polite">
                {monthTitle}
              </span>
              <button
                type="button"
                aria-label={t.dpNext}
                className={nav}
                onClick={() => setMonth(addMonths(month, 1))}
              >
                <ChevronRight className="h-5 w-5 rtl:-scale-x-100" aria-hidden />
              </button>
            </div>

            <div role="grid" aria-label={monthTitle} onKeyDown={onGridKey}>
              <div role="row" className="grid grid-cols-7 text-center text-xs text-muted">
                {days.slice(0, 7).map((d) => (
                  <abbr
                    key={d.getDay()}
                    role="columnheader"
                    title={weekdayLong.format(d)}
                    className="py-1 no-underline"
                  >
                    {weekday.format(d)}
                  </abbr>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {days.map((d) => {
                  const iso = format(d, ISO);
                  const selected = date !== null && isSameDay(d, date);
                  const isToday = today !== null && isSameDay(d, today);
                  return (
                    <button
                      key={iso}
                      type="button"
                      role="gridcell"
                      data-date={iso}
                      tabIndex={isSameDay(d, focused) ? 0 : -1}
                      aria-label={dayLabel.format(d)}
                      aria-selected={selected}
                      aria-current={isToday ? "date" : undefined}
                      onClick={() => pick(d)}
                      className={cn(
                        "mx-auto grid h-10 w-10 cursor-pointer place-items-center rounded-xl text-sm tabular-nums transition-colors",
                        !isSameMonth(d, month) && !selected && "opacity-40",
                        selected
                          ? "bg-primary font-semibold text-primary-foreground"
                          : isToday
                            ? "border border-accent text-accent hover:bg-neutral-bg"
                            : "hover:bg-neutral-bg active:bg-neutral-bg",
                      )}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <button
                type="button"
                onClick={() => pick(new Date())}
                className="min-h-10 cursor-pointer rounded-xl px-3 text-sm font-medium text-accent transition-colors hover:bg-neutral-bg"
              >
                {t.rsToday}
              </button>
              {clearable && value && (
                <button
                  type="button"
                  onClick={() => {
                    set("");
                    close();
                  }}
                  className="min-h-10 cursor-pointer rounded-xl px-3 text-sm transition-colors hover:bg-neutral-bg"
                >
                  {t.dpClear}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Hour and minute as two styled lists. Always laid out left-to-right so "09:30" reads as written. */
export function TimeField({
  value,
  onChange,
  step = 5,
  disabled,
  className,
  "aria-label": label,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Minute step of the list; an existing value off the step is still kept and shown. */
  step?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const { t } = useI18n();
  const [h = "", m = ""] = (value || "").split(":");
  const hours = Array.from({ length: 24 }, (_, i) => pad(i));
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => pad(i * step));
  if (m && !minutes.includes(m)) minutes.push(m);
  minutes.sort();
  const sel = cn(controlCls, "min-w-0 flex-1 cursor-pointer px-3 tabular-nums");
  return (
    <div
      role="group"
      aria-label={label}
      dir="ltr"
      className={cn("flex items-center gap-1.5", className)}
    >
      <select
        aria-label={t.dpHour}
        className={sel}
        disabled={disabled}
        value={h}
        onChange={(e) => onChange(`${e.target.value}:${m || "00"}`)}
      >
        {!h && <option value="">--</option>}
        {hours.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span aria-hidden className="text-muted">
        :
      </span>
      <select
        aria-label={t.dpMinute}
        className={sel}
        disabled={disabled}
        value={m}
        onChange={(e) => onChange(`${h || "00"}:${e.target.value}`)}
      >
        {!m && <option value="">--</option>}
        {minutes.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Date + time in one value ("yyyy-MM-ddTHH:mm"), the format of the native datetime-local input. */
export function DateTimeField({
  value,
  onChange,
  clearable,
  disabled,
  ...a11y
}: A11y & {
  value: string;
  onChange: (value: string) => void;
  clearable?: boolean;
  disabled?: boolean;
}) {
  const [d = "", tm = ""] = (value || "").split("T");
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <DateField
        {...a11y}
        value={d}
        clearable={clearable}
        disabled={disabled}
        onChange={(nd) => onChange(nd ? `${nd}T${tm || "00:00"}` : "")}
      />
      <TimeField
        value={tm}
        disabled={disabled}
        onChange={(nt) => onChange(`${d || format(new Date(), ISO)}T${nt}`)}
        className="w-40"
      />
    </div>
  );
}
