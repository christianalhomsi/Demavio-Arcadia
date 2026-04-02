import { z } from "zod";

export const bookingSchema = z
  .object({
    hall_id: z.string().uuid(),
    device_id: z.string().uuid(),
    start_time: z.coerce.date(),
    end_time: z.coerce.date(),
  })
  .refine((data) => data.end_time > data.start_time, {
    message: "end_time must be after start_time",
    path: ["end_time"],
  });

export type BookingInput = z.infer<typeof bookingSchema>;
