import { describe, expect, it } from "vitest";
import { hallProfileSchema, hasOverlap, policiesSchema, workingHoursSchema } from "./schemas";

describe("hallProfileSchema", () => {
  it("trims and requires a name", () => {
    expect(
      hallProfileSchema.safeParse({ name: "  ", address: "", contactPhone: "", timeZone: "UTC" })
        .success,
    ).toBe(false);
    const ok = hallProfileSchema.parse({
      name: " Hall ",
      address: "",
      contactPhone: "",
      timeZone: "UTC",
    });
    expect(ok.name).toBe("Hall");
  });
});

describe("policiesSchema", () => {
  const base = {
    checkinGraceMinutes: 10,
    cancellationDeadlineMinutes: 60,
    reminderMinutes: 15,
    waitingListEnabled: false,
    allowPartialPayments: false,
    paymentMethods: ["cash" as const],
  };
  it("accepts valid values", () => {
    expect(policiesSchema.safeParse(base).success).toBe(true);
  });
  it.each([
    { checkinGraceMinutes: -1 },
    { checkinGraceMinutes: 1.5 },
    { reminderMinutes: 5000 },
    { paymentMethods: [] },
    { paymentMethods: ["crypto"] },
    { checkinGraceMinutes: Number.NaN },
  ])("rejects %j", (patch) => {
    expect(policiesSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});

describe("workingHoursSchema", () => {
  it("accepts separate ranges and overnight ranges", () => {
    expect(
      workingHoursSchema.safeParse([
        { weekday: 1, opens: "09:00", closes: "13:00" },
        { weekday: 1, opens: "14:00", closes: "23:00" },
        { weekday: 5, opens: "18:00", closes: "02:00" },
      ]).success,
    ).toBe(true);
  });
  it("rejects bad times and equal open/close", () => {
    expect(
      workingHoursSchema.safeParse([{ weekday: 1, opens: "9:00", closes: "10:00" }]).success,
    ).toBe(false);
    expect(
      workingHoursSchema.safeParse([{ weekday: 1, opens: "25:00", closes: "10:00" }]).success,
    ).toBe(false);
    expect(
      workingHoursSchema.safeParse([{ weekday: 1, opens: "09:00", closes: "09:00" }]).success,
    ).toBe(false);
    expect(
      workingHoursSchema.safeParse([{ weekday: 7, opens: "09:00", closes: "10:00" }]).success,
    ).toBe(false);
  });
  it("detects same-day and overnight overlaps (same rule as the backend)", () => {
    expect(
      hasOverlap([
        { weekday: 2, opens: "09:00", closes: "12:00" },
        { weekday: 2, opens: "11:00", closes: "15:00" },
      ]),
    ).toBe(true);
    expect(
      hasOverlap([
        { weekday: 5, opens: "22:00", closes: "03:00" },
        { weekday: 6, opens: "02:00", closes: "08:00" },
      ]),
    ).toBe(true);
    expect(
      hasOverlap([
        { weekday: 6, opens: "22:00", closes: "03:00" },
        { weekday: 0, opens: "02:00", closes: "08:00" },
      ]),
    ).toBe(true);
    expect(
      hasOverlap([
        { weekday: 5, opens: "22:00", closes: "03:00" },
        { weekday: 6, opens: "03:00", closes: "08:00" },
      ]),
    ).toBe(false);
    expect(
      workingHoursSchema.safeParse([
        { weekday: 2, opens: "09:00", closes: "12:00" },
        { weekday: 2, opens: "11:00", closes: "15:00" },
      ]).success,
    ).toBe(false);
  });
});
