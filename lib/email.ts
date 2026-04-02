import { emailEnv } from "@/lib/env";

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  // Replace this block with your email provider SDK call
  // e.g. Resend, SendGrid, Nodemailer, AWS SES
  const safeEmail = email.replace(/[\r\n]/g, "");
  console.log(`[email] Sending OTP to ${safeEmail} from ${emailEnv.from}`);

  // Example with Resend:
  // const resend = new Resend(emailEnv.apiKey);
  // await resend.emails.send({
  //   from: emailEnv.from,
  //   to: email,
  //   subject: "Your verification code",
  //   text: `Your code is: ${otp}`,
  // });
}
