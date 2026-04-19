import { getEmailEnv } from "@/lib/env";

export type ReservationReminderPayload = {
  user_id: string;
  reservation_id: string;
  start_time: string;
  device_id: string;
};

export async function sendReservationReminder(
  payload: ReservationReminderPayload
): Promise<void> {
  const emailEnv = getEmailEnv();
  // Replace with your notification provider (email, SMS, push, etc.)
  // e.g. Resend, Twilio, Firebase Cloud Messaging
  console.log(
    `[notify] Reminder for reservation ${payload.reservation_id}`,
    `starting at ${payload.start_time}`,
    `from ${emailEnv.fromEmail}`
  );

  // Example with Resend:
  // const resend = new Resend(emailEnv.apiKey);
  // await resend.emails.send({
  //   from: emailEnv.fromEmail,
  //   to: await resolveUserEmail(payload.user_id),
  //   subject: "Your session starts soon",
  //   text: `Your booking starts at ${payload.start_time}.`,
  // });
}
