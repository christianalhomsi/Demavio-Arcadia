import { z } from "zod";
import { isUuid } from "@/lib/auth/authorize";
import type { Messages } from "@/lib/i18n/messages";

export const walkInSchema = z
  .object({
    deviceId: z.string().refine(isUuid, "Choose a device"),
    type: z.enum(["fixed", "open"]),
    durationMinutes: z.number({ error: "Enter a duration" }).int("Whole minutes only").nullable(),
    guestName: z
      .string()
      .trim()
      .min(1, "Enter the customer's name")
      .max(80, "At most 80 characters"),
  })
  .superRefine((v, ctx) => {
    if (
      v.type === "fixed" &&
      (v.durationMinutes === null || v.durationMinutes < 5 || v.durationMinutes > 720)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["durationMinutes"],
        message: "Choose 5 to 720 minutes",
      });
    }
  });
export type WalkInInput = z.infer<typeof walkInSchema>;

export const END_TYPES = ["normal", "interrupted", "administrative"] as const;
export type EndType = (typeof END_TYPES)[number];

export const END_TYPE_LABEL: Record<EndType, string> = {
  normal: "Normal end",
  interrupted: "Interrupted (e.g. power cut)",
  administrative: "Administrative termination",
};

/** Dictionary key of each end type (END_TYPE_LABEL stays the English fallback). */
export const END_TYPE_KEYS: Record<EndType, keyof Messages> = {
  normal: "endNormal",
  interrupted: "endInterrupted",
  administrative: "endAdmin",
};

export const extendSchema = z.object({
  minutes: z
    .number({ error: "Enter minutes" })
    .int("Whole minutes only")
    .min(1, "At least 1")
    .max(720, "At most 720"),
  reason: z.string().trim().min(1, "A reason is required").max(300),
});
export type ExtendInput = z.infer<typeof extendSchema>;

export type SessionStatus =
  "starting" | "in_progress" | "ending" | "completed" | "interrupted" | "canceled";
