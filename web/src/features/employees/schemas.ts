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
  // Checked against the hall's currency in the action (Arabic digits are accepted there).
  discountLimit: z.string().trim().max(20, "Enter a valid amount."),
  grants: z.array(z.enum(GRANTABLE_PERMISSIONS as [string, ...string[]])),
});
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;

export const deactivateSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(300),
});
