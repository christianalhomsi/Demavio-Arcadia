import { formatInTimeZone } from "date-fns-tz";

/** All operational times render in the hall's IANA time zone (spec §7.1). */
export function formatHallTime(
  iso: string | Date,
  timeZone: string,
  pattern = "d MMM yyyy, HH:mm",
): string {
  return formatInTimeZone(iso, timeZone, pattern);
}

export function formatHallTimeWithZone(iso: string | Date, timeZone: string): string {
  return formatInTimeZone(iso, timeZone, "d MMM yyyy, HH:mm zzz");
}

/** Remaining/elapsed milliseconds as H:MM:SS. Display only; the backend owns session timing. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
