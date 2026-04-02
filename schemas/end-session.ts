import { z } from "zod";

export const endSessionSchema = z.object({
  hall_id: z.string().uuid(),
  rate_per_hour: z.number().positive(),
});

export type EndSessionInput = z.infer<typeof endSessionSchema>;
