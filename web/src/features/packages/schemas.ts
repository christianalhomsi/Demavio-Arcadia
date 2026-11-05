import { z } from "zod";

/** UX validation only; upsert_package validates again inside the database. */
export const packageSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60, "At most 60 characters"),
  durationMinutes: z.number().int().min(5, "At least 5 minutes").max(720, "At most 12 hours"),
  /** Typed price, e.g. "5.00". Converted to minor units on the server. */
  priceText: z.string().trim().min(1, "Enter a price").max(20),
  /** "" = any device, "device:<uuid>", or "category:<name>". */
  target: z.string().max(60),
  /** "HH:MM" or "". Both or neither. */
  from: z.string().max(5),
  to: z.string().max(5),
  /** "YYYY-MM-DD" or "". */
  validFrom: z.string().max(10),
  validUntil: z.string().max(10),
  /** Whole number or "". */
  maxUses: z.string().max(6),
  active: z.boolean(),
});
export type PackageInput = z.infer<typeof packageSchema>;
