import { describe, expect, it } from "vitest";
import { dateToIso, isoToDate } from "./timeOfDay";

describe("validity dates in the hall's time zone", () => {
  it("starts and ends the day at the hall's midnight", () => {
    // Damascus is UTC+3: the hall's 1 Dec starts at 30 Nov 21:00 UTC.
    expect(dateToIso("2026-12-01", false, "Asia/Damascus")).toBe("2026-11-30T21:00:00.000Z");
    expect(dateToIso("2026-12-01", true, "Asia/Damascus")).toBe("2026-12-01T21:00:00.000Z");
  });
  it("reads the same days back for the edit form", () => {
    expect(isoToDate("2026-11-30T21:00:00.000Z", false, "Asia/Damascus")).toBe("2026-12-01");
    expect(isoToDate("2026-12-01T21:00:00.000Z", true, "Asia/Damascus")).toBe("2026-12-01");
  });
  it("keeps UTC as the default and rejects impossible dates", () => {
    expect(dateToIso("2026-12-01")).toBe("2026-12-01T00:00:00.000Z");
    expect(isoToDate("2026-12-02T00:00:00.000Z", true)).toBe("2026-12-01");
    expect(dateToIso("2026-02-30", false, "Asia/Damascus")).toBeNull();
  });
});
