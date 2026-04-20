import { z } from "zod";

const staffHallRoleSchema = z.enum(["hall_staff", "hall_manager"]);

export const hallBootstrapSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional().nullable(),
  devices: z.array(z.object({
    device_type_id: z.string().uuid(),
    quantity: z.coerce.number().int().min(1).max(500),
    price_per_hour: z.coerce.number().min(0),
  })).min(1),
  working_hours: z.array(z.object({
    day: z.number().int().min(0).max(6),
    open_time: z.string(),
    close_time: z.string(),
    is_open: z.boolean(),
  })).optional(),
  staff: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    role: staffHallRoleSchema,
  }).optional(),
  extra_staff: z.array(
    z.object({
      email: z.string().email(),
      password: z.string().min(6),
    })
  ).optional(),
});

export type HallBootstrapInput = z.infer<typeof hallBootstrapSchema>;

export const inviteUserSchema = z.object({
  email: z.string().email(),
});

export const staffAssignmentSchema = z.object({
  hall_id: z.string().uuid(),
  email: z.string().email(),
  role: staffHallRoleSchema,
});
