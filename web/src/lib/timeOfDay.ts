/** Time-of-day helpers for pricing windows and packages. Minutes since midnight in the hall's time zone. */

/** "18:30" -> 1110. "24:00" is allowed as an end time. Returns null when it is not a valid time. */
export function hmToMinutes(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]);
  if (Number(m[2]) > 59 || total > 1440) return null;
  return total;
}

/** 1110 -> "18:30"; 1440 -> "24:00". */
export function minutesToHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "2026-03-01" -> ISO instant at the start (or end) of that UTC day. Null when not a real date. */
export function dateToIso(text: string, endOfDay = false): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text) return null;
  if (endOfDay) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/** Inverse of dateToIso for prefilling a date input. */
export function isoToDate(iso: string | null, endOfDay = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (endOfDay) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
