import { z } from "zod";
import type { Messages } from "@/lib/i18n/messages";
import { isUuid } from "@/lib/auth/authorize";

/** UX validation only; create_reservation validates and revalidates inside its transaction. */
export const createReservationSchema = z
  .object({
    deviceId: z.string().refine(isUuid, "Choose a device"),
    guestName: z
      .string()
      .trim()
      .min(1, "Enter the customer's name")
      .max(80, "At most 80 characters"),
    /** ISO timestamps (UTC). */
    startAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Choose a start time"),
    endAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Choose an end time"),
  })
  .superRefine((v, ctx) => {
    const ms = Date.parse(v.endAt) - Date.parse(v.startAt);
    if (ms < 5 * 60_000 || ms > 24 * 3_600_000) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Duration must be 5 minutes to 24 hours",
      });
    }
  });
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const reasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required")
  .max(300, "At most 300 characters");

export type ReservationStatus = "pending" | "confirmed" | "checked_in" | "canceled" | "no_show";

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "Awaiting confirmation",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  canceled: "Canceled",
  no_show: "No-show",
};

/** Dictionary key of each status label (STATUS_LABEL stays the English fallback). */
export const STATUS_KEYS: Record<ReservationStatus, keyof Messages> = {
  pending: "statusPending",
  confirmed: "statusConfirmed",
  checked_in: "statusCheckedIn",
  canceled: "statusCanceled",
  no_show: "statusNoShow",
};
