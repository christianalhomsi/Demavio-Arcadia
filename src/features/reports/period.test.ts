import { describe, expect, it } from "vitest";
import { presetPeriods, resolvePeriod } from "./period";

const NOW = new Date("2026-10-26T12:00:00Z");

describe("resolvePeriod", () => {
  it("defaults to today in the HALL's zone, not the server's", () => {
    // 23:30 UTC on the 26th is already the 27th in Tokyo.
    const late = new Date("2026-10-26T23:30:00Z");
    expect(resolvePeriod({}, "Asia/Tokyo", late)).toMatchObject({
      from: "2026-10-27",
      to: "2026-10-27",
    });
    expect(resolvePeriod({}, "America/New_York", late)).toMatchObject({
      from: "2026-10-26",
      to: "2026-10-26",
    });
  });
  it("turns inclusive dates into a half-open instant range in the hall's zone", () => {
    const p = resolvePeriod({ from: "2026-10-01", to: "2026-10-02" }, "Asia/Tokyo", NOW);
    expect(p.start.toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-10-02T15:00:00.000Z");
  });
  it("handles a DST change day correctly (25-hour day)", () => {
    const p = resolvePeriod({ from: "2026-11-01", to: "2026-11-01" }, "America/New_York", NOW);
    expect(p.end.getTime() - p.start.getTime()).toBe(25 * 3_600_000);
  });
  it("a single date means that day", () => {
    expect(resolvePeriod({ from: "2026-10-05" }, "UTC", NOW)).toMatchObject({
      from: "2026-10-05",
      to: "2026-10-05",
    });
  });
  it("falls back safely on junk, reversed or oversized ranges", () => {
    expect(resolvePeriod({ from: "nope", to: "x" }, "UTC", NOW)).toMatchObject({
      from: "2026-10-26",
      to: "2026-10-26",
    });
    expect(resolvePeriod({ from: "2026-10-10", to: "2026-10-01" }, "UTC", NOW)).toMatchObject({
      from: "2026-10-10",
      to: "2026-10-10",
    });
    const huge = resolvePeriod({ from: "2020-01-01", to: "2026-10-01" }, "UTC", NOW);
    expect(huge.to).toBe(huge.from);
    const year = resolvePeriod({ from: "2026-01-01", to: "2026-12-31" }, "UTC", NOW);
    expect(year.to).toBe("2026-12-31");
  });
});

describe("presetPeriods", () => {
  it("builds today, yesterday, last 7 days and this month", () => {
    expect(presetPeriods("UTC", NOW).map((p) => [p.label, p.from, p.to])).toEqual([
      ["Today", "2026-10-26", "2026-10-26"],
      ["Yesterday", "2026-10-25", "2026-10-25"],
      ["Last 7 days", "2026-10-20", "2026-10-26"],
      ["This month", "2026-10-01", "2026-10-26"],
    ]);
  });
});
