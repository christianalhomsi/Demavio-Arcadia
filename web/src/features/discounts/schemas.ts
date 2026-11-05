import { z } from "zod";

/** UX validation only; upsert_discount validates again inside the database. */
export const discountSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60, "At most 60 characters"),
  kind: z.enum(["amount", "percent"]),
  /** Typed value: money for "amount", a percent such as "12.5" for "percent". */
  valueText: z.string().trim().min(1, "Enter a value").max(20),
  /** "YYYY-MM-DD" or "". */
  validFrom: z.string().max(10),
  validUntil: z.string().max(10),
  /** Whole number or "". */
  maxUses: z.string().max(6),
  active: z.boolean(),
});
export type DiscountInput = z.infer<typeof discountSchema>;

export const applyDiscountSchema = z.object({
  discountId: z.string(),
  reason: z.string().trim().min(1, "Enter a reason").max(300, "At most 300 characters"),
});
export type ApplyDiscountInput = z.infer<typeof applyDiscountSchema>;

/** "12.5" -> 1250 (basis points). Null unless 0.01..100 with at most two decimals. */
export function percentToBasisPoints(text: string): number | null {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text.trim())) return null;
  const [whole, frac = ""] = text.trim().split(".");
  const bp = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return bp >= 1 && bp <= 10000 ? bp : null;
}

/** 1250 -> "12.5" for editing and display. */
export function basisPointsToPercent(bp: number): string {
  return String(bp / 100);
}
