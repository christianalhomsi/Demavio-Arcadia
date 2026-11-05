import { z } from "zod";

/** UX validation only; upsert_product validates again inside the database. */
export const productSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60, "At most 60 characters"),
  /** Typed price, e.g. "1.50". Converted to minor units on the server. */
  priceText: z.string().trim().min(1, "Enter a price").max(20),
  active: z.boolean(),
});
export type ProductInput = z.infer<typeof productSchema>;

export const MAX_QUANTITY = 99;
