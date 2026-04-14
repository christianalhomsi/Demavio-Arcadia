import { z } from "zod";

const staffHallRoleSchema = z.enum(["hall_staff", "hall_manager"]);

export const hallBootstrapSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional().nullable(),
  device_count: z.coerce.number().int().min(1).max(500),
  device_name_prefix: z.string().min(1).max(80).optional().default("Station"),
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
