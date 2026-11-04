import { z } from "zod";
import { PERMISSIONS } from "@/contracts/permissions";

export const HALL_ROLES = ["employee", "owner"] as const;

export const inviteSchema = z.object({
  email: z.email("Enter a valid email").max(254, "Email is too long"),
  role: z.enum(HALL_ROLES),
});
export type InviteInput = z.infer<typeof inviteSchema>;

/** Permissions that may be granted on top of a role. Platform and sales permissions never apply. */
export const GRANTABLE_PERMISSIONS = PERMISSIONS.filter((p) => p !== "platform.tenants.manage");

export const memberUpdateSchema = z.object({
  role: z.enum(HALL_ROLES),
  discountLimit: z
    .string()
    .trim()
    .regex(/^(\d+(\.\d{1,2})?)?$/, "Enter an amount like 10.50 or leave empty"),
  grants: z.array(z.enum(GRANTABLE_PERMISSIONS as [string, ...string[]])),
});
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;

export const deactivateSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(300),
});
