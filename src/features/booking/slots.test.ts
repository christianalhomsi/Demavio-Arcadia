import { describe, expect, it } from "vitest";
import { buildSlots, isBookable, monthGrid, openIntervals } from "./slots";

const TZ = "Asia/Damascus"; // UTC+3 all year since 2022
const everyDay = (opens: string, closes: string) =>
  Array.from({ length: 7 }, (_, weekday) => ({ weekday, opens, closes }));

describe("openIntervals", () => {
  it("treats a hall with no hours as open all day", () => {
    const [i] = openIntervals("2026-11-02", TZ, []);
    expect(i && i.end - i.start).toBe(24 * 3_600_000);
  });
  it("includes the previous day's overnight range", () => {
    const ranges = openIntervals("2026-11-03", TZ, everyDay("18:00:00", "02:00:00"));
    // Monday 18:00 -> Tuesday 02:00 and Tuesday 18:00 -> Wednesday 02:00
    expect(ranges).toHaveLength(2);
    expect(ranges[0]!.end - ranges[0]!.start).toBe(8 * 3_600_000);
  });
});

describe("buildSlots", () => {
  const base = {
    date: "2026-11-02",
    timeZone: TZ,
    hours: everyDay("10:00:00", "12:00:00"),
    now: Date.parse("2026-11-01T00:00:00Z"),
  };
  it("lists 30 minute starts inside opening hours", () => {
    const slots = buildSlots({ ...base, busy: [], durationMin: 30 });
    expect(slots.map((s) => s.label)).toEqual(["10:00", "10:30", "11:00", "11:30"]);
    expect(slots.every((s) => s.available)).toBe(true);
  });
  it("blocks starts whose duration runs past closing or into a busy range", () => {
    const busy = [
      { start: Date.parse("2026-11-02T08:30:00Z"), end: Date.parse("2026-11-02T09:00:00Z") },
    ]; // 11:30-12:00 local
    const slots = buildSlots({ ...base, busy, durationMin: 60 });
    expect(slots.map((s) => s.available)).toEqual([true, true, false, false]);
  });
  it("blocks slots in the past", () => {
    const slots = buildSlots({
      ...base,
      now: Date.parse("2026-11-02T07:10:00Z"),
      busy: [],
      durationMin: 30,
    });
    expect(slots.map((s) => s.available)).toEqual([false, true, true, true]);
  });
});

describe("isBookable", () => {
  it("rejects ranges that touch nothing open", () => {
    expect(isBookable(5, 10, [{ start: 0, end: 8 }], [])).toBe(false);
  });
  it("allows back-to-back bookings", () => {
    expect(isBookable(8, 10, [{ start: 0, end: 20 }], [{ start: 5, end: 8 }])).toBe(true);
  });
});

describe("monthGrid", () => {
  it("pads weeks to full rows starting on Sunday", () => {
    const weeks = monthGrid(2026, 11); // 1 Nov 2026 is a Sunday
    expect(weeks[0]![0]).toBe("2026-11-01");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
  });
});

import { pickRange, type Slot } from "./slots";

describe("pickRange", () => {
  const T0 = Date.parse("2026-11-02T10:00:00Z");
  const step = 30 * 60_000;
  const grid = (blocked: number[] = []): Slot[] =>
    Array.from({ length: 12 }, (_, i) => ({
      startIso: new Date(T0 + i * step).toISOString(),
      label: "",
      available: !blocked.includes(i),
      state: blocked.includes(i) ? ("booked" as const) : ("available" as const),
    }));
  const at = (i: number) => T0 + i * step;

  it("starts with one slot and clears when it is clicked again", () => {
    const one = pickRange(null, at(2), grid());
    expect(one).toEqual({ start: at(2), end: at(3) });
    expect(pickRange(one, at(2), grid())).toBeNull();
  });
  it("extends forward and backward from the first slot", () => {
    const one = pickRange(null, at(2), grid());
    expect(pickRange(one, at(4), grid())).toEqual({ start: at(2), end: at(5) });
    expect(pickRange(one, at(0), grid())).toEqual({ start: at(0), end: at(3) });
  });
  it("restarts when the range crosses a booked slot or passes 4 hours", () => {
    const one = pickRange(null, at(0), grid([2]));
    expect(pickRange(one, at(4), grid([2]))).toEqual({ start: at(4), end: at(5) });
    const long = pickRange(null, at(0), grid());
    expect(pickRange(long, at(10), grid())).toEqual({ start: at(10), end: at(11) });
    expect(pickRange(long, at(7), grid())).toEqual({ start: at(0), end: at(8) }); // exactly 4 h is allowed
  });
});
