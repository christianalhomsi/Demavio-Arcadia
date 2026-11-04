import { describe, expect, it } from "vitest";
import { blockPosition, dayWindow, hourTicks, parseDateParam, shiftDate } from "./dayWindow";

describe("dayWindow", () => {
  it("covers midnight to midnight in the hall's zone", () => {
    const w = dayWindow("2026-10-24", "Asia/Dubai"); // UTC+4, no DST
    expect(w.start.toISOString()).toBe("2026-10-23T20:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-24T20:00:00.000Z");
  });
  it("handles daylight-saving days (23 and 25 hours)", () => {
    const spring = dayWindow("2026-03-08", "America/New_York");
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    const autumn = dayWindow("2026-11-01", "America/New_York");
    expect((autumn.end.getTime() - autumn.start.getTime()) / 3_600_000).toBe(25);
    expect(hourTicks(autumn, "America/New_York")).toHaveLength(25);
  });
});

describe("blockPosition", () => {
  const w = dayWindow("2026-10-24", "UTC");
  it("positions blocks proportionally", () => {
    expect(blockPosition("2026-10-24T06:00:00Z", "2026-10-24T12:00:00Z", w)).toEqual({
      left: 25,
      width: 25,
    });
  });
  it("clips blocks that cross the day boundary and drops those outside it", () => {
    expect(blockPosition("2026-10-23T22:00:00Z", "2026-10-24T01:00:00Z", w)).toMatchObject({
      left: 0,
    });
    expect(blockPosition("2026-10-25T01:00:00Z", "2026-10-25T02:00:00Z", w)).toBeNull();
  });
});

describe("date params", () => {
  const now = new Date("2026-10-24T22:00:00Z");
  it("accepts valid dates and rejects junk", () => {
    expect(parseDateParam("2026-12-01", "UTC", now)).toBe("2026-12-01");
    expect(parseDateParam("2026-13-45", "UTC", now)).toBe("2026-10-24");
    expect(parseDateParam("<script>", "UTC", now)).toBe("2026-10-24");
    expect(parseDateParam(undefined, "Asia/Dubai", now)).toBe("2026-10-25"); // already tomorrow there
  });
  it("shifts days", () => {
    expect(shiftDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});
