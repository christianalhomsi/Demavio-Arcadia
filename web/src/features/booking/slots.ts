import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { shiftDate } from "@/lib/dayWindow";

export interface WorkingRange {
  weekday: number; // 0 = Sunday
  opens: string; // "HH:MM:SS"
  closes: string;
}

export interface Interval {
  start: number; // epoch ms
  end: number;
}

export interface Slot {
  startIso: string;
  label: string;
  available: boolean;
  /** Why a slot cannot be picked: already started, or taken/closed for the requested length. */
  state: "available" | "booked" | "past";
}

export const SLOT_MINUTES = 30;
export const DURATIONS = [30, 60, 90, 120, 180, 240] as const;
const MIN = 60_000;

const hhmm = (t: string) => t.slice(0, 5);

/**
 * Opening intervals that can contain a booking starting on `date` (hall zone). Includes the previous
 * day's overnight range (closes <= opens ends the next day, DEC-W06). No configured hours means the
 * hall is treated as open all day, matching within_working_hours in the database.
 */
export function openIntervals(date: string, timeZone: string, hours: WorkingRange[]): Interval[] {
  if (hours.length === 0) {
    const start = fromZonedTime(`${date}T00:00:00`, timeZone).getTime();
    return [{ start, end: fromZonedTime(`${shiftDate(date, 1)}T00:00:00`, timeZone).getTime() }];
  }
  const out: Interval[] = [];
  for (const day of [shiftDate(date, -1), date]) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    for (const h of hours.filter((x) => x.weekday === weekday)) {
      const start = fromZonedTime(`${day}T${hhmm(h.opens)}:00`, timeZone).getTime();
      const overnight = hhmm(h.closes) <= hhmm(h.opens);
      const endDay = overnight ? shiftDate(day, 1) : day;
      out.push({ start, end: fromZonedTime(`${endDay}T${hhmm(h.closes)}:00`, timeZone).getTime() });
    }
  }
  return out;
}

/** True when [start, end) sits inside one opening interval and overlaps no busy interval. */
export function isBookable(
  start: number,
  end: number,
  open: Interval[],
  busy: Interval[],
): boolean {
  if (!open.some((o) => o.start <= start && end <= o.end)) return false;
  return !busy.some((b) => b.start < end && b.end > start);
}

/** Start times (every 30 min) for one day with whether a booking of `durationMin` fits there. */
export function buildSlots(args: {
  date: string;
  timeZone: string;
  hours: WorkingRange[];
  busy: Interval[];
  now: number;
  durationMin: number;
}): Slot[] {
  const { date, timeZone, hours, busy, now, durationMin } = args;
  const dayStart = fromZonedTime(`${date}T00:00:00`, timeZone).getTime();
  const dayEnd = fromZonedTime(`${shiftDate(date, 1)}T00:00:00`, timeZone).getTime();
  const open = openIntervals(date, timeZone, hours);
  const starts = new Set<number>();
  for (const o of open) {
    for (let t = o.start; t + SLOT_MINUTES * MIN <= o.end; t += SLOT_MINUTES * MIN) {
      if (t >= dayStart && t < dayEnd) starts.add(t);
    }
  }
  return [...starts]
    .sort((a, b) => a - b)
    .map((t) => {
      // Keep a small lead so a slot is never "available" while it is already starting.
      const past = t < now + 5 * MIN;
      const free = !past && isBookable(t, t + durationMin * MIN, open, busy);
      return {
        startIso: new Date(t).toISOString(),
        label: formatInTimeZone(t, timeZone, "HH:mm"),
        available: free,
        state: past ? ("past" as const) : free ? ("available" as const) : ("booked" as const),
      };
    });
}

/** Weeks (Sunday first) of a month; null pads the leading/trailing cells. `month` is 1-12. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null);
  for (let d = 1; d <= days; d++) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const MAX_SLOTS = 8; // 4 hours, the player booking limit

export interface Range {
  start: number; // epoch ms
  end: number;
}

/**
 * Two-click range picking on the slot grid: the first click selects one 30 minute slot, the next click
 * extends (or shrinks) the range from that first slot to the clicked one. A range that would cross an
 * unavailable slot or exceed the 4 hour limit restarts at the clicked slot; clicking the only selected
 * slot clears it.
 */
export function pickRange(current: Range | null, clicked: number, slots: Slot[]): Range | null {
  const step = SLOT_MINUTES * MIN;
  const single = { start: clicked, end: clicked + step };
  if (!current) return single;
  if (clicked === current.start) return current.end - current.start === step ? null : single;

  const lo = Math.min(current.start, clicked);
  const hi = Math.max(current.start, clicked) + step;
  if ((hi - lo) / step > MAX_SLOTS) return single;
  const inside = slots.filter((s) => {
    const t = Date.parse(s.startIso);
    return t >= lo && t < hi;
  });
  if (inside.length !== (hi - lo) / step || !inside.every((s) => s.available)) return single;
  return { start: lo, end: hi };
}
