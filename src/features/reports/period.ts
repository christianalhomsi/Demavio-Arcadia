import { dayWindow, parseDateParam, shiftDate, todayInZone } from "@/lib/dayWindow";

export interface ReportPeriod {
  /** Inclusive calendar dates in the hall's time zone. */
  from: string;
  to: string;
  /** Instants sent to the backend: [start, end). */
  start: Date;
  end: Date;
}

const MAX_DAYS = 366;

const dayCount = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/**
 * Resolves ?from=&to= (calendar dates in the HALL's zone, both inclusive) into the instant range the
 * backend expects. Untrusted input: anything invalid falls back to today; ranges are capped to a year.
 */
export function resolvePeriod(
  raw: { from?: string; to?: string },
  timeZone: string,
  now = new Date(),
): ReportPeriod {
  const today = todayInZone(timeZone, now);
  let from = parseDateParam(raw.from, timeZone, now);
  let to = raw.to ? parseDateParam(raw.to, timeZone, now) : from;
  if (!raw.from && !raw.to) {
    from = today;
    to = today;
  }
  if (to < from || dayCount(from, to) > MAX_DAYS) to = from;
  return { from, to, start: dayWindow(from, timeZone).start, end: dayWindow(to, timeZone).end };
}

export function presetPeriods(timeZone: string, now = new Date()) {
  const today = todayInZone(timeZone, now);
  return [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: shiftDate(today, -1), to: shiftDate(today, -1) },
    { label: "Last 7 days", from: shiftDate(today, -6), to: today },
    { label: "This month", from: `${today.slice(0, 7)}-01`, to: today },
  ];
}
