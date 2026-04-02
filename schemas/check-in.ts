import { z } from "zod";

export const checkInSchema = z.object({
  reservation_id: z.string().uuid(),
  device_id: z.string().uuid(),
  hall_id: z.string().uuid(),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
