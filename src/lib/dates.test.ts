import { describe, expect, it } from "vitest";
import { formatDuration, formatHallTime } from "./dates";

describe("formatHallTime", () => {
  it("renders in the hall time zone", () => {
    expect(formatHallTime("2026-10-24T22:30:00Z", "Asia/Dubai", "HH:mm")).toBe("02:30");
    expect(formatHallTime("2026-10-24T22:30:00Z", "UTC", "HH:mm")).toBe("22:30");
  });
  it("handles DST differences", () => {
    expect(formatHallTime("2026-01-15T12:00:00Z", "America/New_York", "HH:mm")).toBe("07:00");
    expect(formatHallTime("2026-07-15T12:00:00Z", "America/New_York", "HH:mm")).toBe("08:00");
  });
});

describe("formatDuration", () => {
  it("formats H:MM:SS and clamps negatives", () => {
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(-5)).toBe("0:00:00");
  });
});
