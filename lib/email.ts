import { Resend } from "resend";
import { emailEnv } from "@/lib/env";

const resend = new Resend(emailEnv.apiKey);

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const { error } = await resend.emails.send({
    from: emailEnv.from,
    to: email,
    subject: "Your verification code",
    html: `<p>Your one-time password is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
  });

  if (error) throw new Error(error.message);
}
