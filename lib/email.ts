import nodemailer from "nodemailer";
import { getEmailEnv } from "@/lib/env";

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const emailEnv = getEmailEnv();
  
  const transporter = nodemailer.createTransport({
    host: emailEnv.host,
    port: emailEnv.port,
    secure: emailEnv.port === 465,
    auth: {
      user: emailEnv.user,
      pass: emailEnv.password,
    },
  });

  await transporter.sendMail({
    from: `"${emailEnv.fromName}" <${emailEnv.fromEmail}>`,
    to: email,
    subject: "Your verification code - Arcadia",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #7c3aed;">Arcadia - Verification Code</h2>
        <p>Your one-time password is:</p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #7c3aed;">${otp}</span>
        </div>
        <p style="color: #6b7280;">This code expires in 10 minutes.</p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">If you didn't request this code, please ignore this email.</p>
      </div>
    `,
  });
}
