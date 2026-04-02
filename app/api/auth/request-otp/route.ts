import { NextResponse } from "next/server";
import { otpRequestSchema } from "@/schemas/otp";
import { generateOtp } from "@/lib/otp";
import { hashOtp } from "@/lib/otp-hash";
import { env } from "@/lib/env";
import { storeOtpRequest } from "@/services/otp";
import { sendOtpEmail } from "@/lib/email";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const parsed = otpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { email } = parsed.data;

  try {
    const otp = generateOtp();
    const hash = await hashOtp(otp, env.OTP_SECRET);

    await storeOtpRequest(email, hash);
    await sendOtpEmail(email, otp);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[request-otp]", err);
    return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
  }
}
