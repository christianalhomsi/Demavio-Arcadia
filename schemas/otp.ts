import { z } from "zod";

export const otpRequestSchema = z.object({
  email: z.string().email(),
});

export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be a 6-digit code"),
});

export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
