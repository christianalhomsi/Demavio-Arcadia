import { z } from "zod";

export const otpRequestSchema = z.object({
  email: z.string().email(),
});

export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type SignupInput = z.infer<typeof signupSchema>;

export const otpVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be a 6-digit code"),
});

export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
