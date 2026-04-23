import { z } from "zod";

export const endSessionSchema = z.object({
  hall_id: z.string().uuid(),
  rate_per_hour: z.number().positive(),
  payment_method: z.enum(['cash', 'wallet']).optional().default('cash'),
  wallet_price_per_hour: z.number().positive().optional(),
});

export type EndSessionInput = z.infer<typeof endSessionSchema>;
