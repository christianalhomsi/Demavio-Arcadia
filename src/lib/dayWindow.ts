import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date (YYYY-MM-DD) in the hall's time zone. */
export function todayInZone(timeZone: string, now = new Date()): string {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}

/** Validates a ?date= value; anything else falls back to today in the hall's zone. */
export function parseDateParam(
  value: string | undefined,
  timeZone: string,
  now = new Date(),
): string {
  if (value && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return value;
  return todayInZone(timeZone, now);
}

/** [start, end) of a calendar day in the hall's zone. A DST day is 23 or 25 hours long, correctly. */
export function dayWindow(date: string, timeZone: string): { start: Date; end: Date } {
  const start = fromZonedTime(`${date}T00:00:00`, timeZone);
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const end = fromZonedTime(`${next}T00:00:00`, timeZone);
  return { start, end };
}

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Horizontal placement of an interval inside a window, as percentages; null if outside it. */
export function blockPosition(
  startIso: string,
  endIso: string,
  window: { start: Date; end: Date },
): { left: number; width: number } | null {
  const total = window.end.getTime() - window.start.getTime();
  const s = Math.max(Date.parse(startIso), window.start.getTime());
  const e = Math.min(Date.parse(endIso), window.end.getTime());
  if (e <= s) return null;
  return {
    left: ((s - window.start.getTime()) / total) * 100,
    width: ((e - s) / total) * 100,
  };
}

/** Hour tick labels (in the hall's zone) with their left offsets. */
export function hourTicks(window: { start: Date; end: Date }, timeZone: string) {
  const total = window.end.getTime() - window.start.getTime();
  const ticks: { label: string; left: number }[] = [];
  for (let t = window.start.getTime(); t < window.end.getTime(); t += 3_600_000) {
    ticks.push({
      label: formatInTimeZone(t, timeZone, "HH"),
      left: ((t - window.start.getTime()) / total) * 100,
    });
  }
  return ticks;
}
