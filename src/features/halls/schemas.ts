import { z } from "zod";

/** Client-side validation for UX only. The RPCs validate again and are authoritative. */

export const hallProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  address: z.string().trim().max(300, "Address is too long"),
  contactPhone: z.string().trim().max(40, "Phone is too long"),
  timeZone: z.string().min(1, "Time zone is required"),
});
export type HallProfileInput = z.infer<typeof hallProfileSchema>;

const minutes = (max: number) =>
  z
    .number({ error: "Enter a number" })
    .int("Whole minutes only")
    .min(0, "Cannot be negative")
    .max(max, `At most ${max}`);

export const PAYMENT_METHODS = ["cash", "wallet"] as const;

export const policiesSchema = z.object({
  checkinGraceMinutes: minutes(1440),
  cancellationDeadlineMinutes: minutes(10080),
  reminderMinutes: minutes(1440),
  waitingListEnabled: z.boolean(),
  allowPartialPayments: z.boolean(),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).min(1, "Choose at least one payment method"),
});
export type PoliciesInput = z.infer<typeof policiesSchema>;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const workingHoursSchema = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      opens: time,
      closes: time,
    }),
  )
  .superRefine((ranges, ctx) => {
    ranges.forEach((r, i) => {
      if (r.opens === r.closes) {
        ctx.addIssue({
          code: "custom",
          path: [i, "closes"],
          message: "Opening and closing must differ",
        });
      }
    });
    if (hasOverlap(ranges)) {
      ctx.addIssue({ code: "custom", message: "Opening hours overlap" });
    }
  });
export type WorkingHoursInput = z.infer<typeof workingHoursSchema>;

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Mirrors the backend overlap rule: an overnight range spills into the next weekday. */
export function hasOverlap(ranges: { weekday: number; opens: string; closes: string }[]): boolean {
  const segs: { id: number; d: number; s: number; e: number }[] = [];
  ranges.forEach((r, id) => {
    const s = toMinutes(r.opens);
    const e = toMinutes(r.closes);
    if (e > s) segs.push({ id, d: r.weekday, s, e });
    else if (e < s) {
      segs.push({ id, d: r.weekday, s, e: 1440 });
      segs.push({ id, d: (r.weekday + 1) % 7, s: 0, e });
    }
  });
  return segs.some((a) => segs.some((b) => a.id !== b.id && a.d === b.d && a.s < b.e && b.s < a.e));
}

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
