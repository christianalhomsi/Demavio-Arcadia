import { getAdminClient } from "@/lib/supabase/admin";
import { sendReservationReminder } from "@/lib/notifications";

const DEFAULT_REMINDER_WINDOW_MINUTES = 60;

export type SendRemindersResult = {
  reminded_count: number;
  failed_count: number;
  reminded_ids: string[];
};

type UpcomingReservation = {
  id: string;
  user_id: string;
  device_id: string;
  start_time: string;
};

export async function sendReservationReminders(
  windowMinutes = DEFAULT_REMINDER_WINDOW_MINUTES
): Promise<SendRemindersResult> {
  const supabase = getAdminClient();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMinutes * 60 * 1000);

  // Fetch confirmed reservations within the window that have not been reminded yet.
  // reminder_sent_at IS NULL is the idempotency guard — already-reminded rows are excluded.
  const { data, error } = await supabase
    .from("reservations")
    .select("id, user_id, device_id, start_time")
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .gte("start_time", now.toISOString())
    .lte("start_time", windowEnd.toISOString());

  if (error) throw new Error(`sendReservationReminders query failed: ${error.message}`);

  const reservations: UpcomingReservation[] = data ?? [];

  const reminded_ids: string[] = [];
  let failed_count = 0;

  for (const reservation of reservations) {
    try {
      await sendReservationReminder({
        user_id: reservation.user_id,
        reservation_id: reservation.id,
        start_time: reservation.start_time,
        device_id: reservation.device_id,
      });

      // Stamp reminder_sent_at only after a successful notification.
      // Conditional update (.is("reminder_sent_at", null)) prevents a race
      // condition if two job instances run concurrently.
      const { error: updateError } = await supabase
        .from("reservations")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", reservation.id)
        .is("reminder_sent_at", null);

      if (updateError) {
        console.error(`[job:reminders] stamp failed for ${reservation.id}:`, updateError.message);
        failed_count++;
      } else {
        reminded_ids.push(reservation.id);
      }
    } catch (err) {
      console.error(`[job:reminders] notify failed for ${reservation.id}:`, err);
      failed_count++;
    }
  }

  return {
    reminded_count: reminded_ids.length,
    failed_count,
    reminded_ids,
  };
}
