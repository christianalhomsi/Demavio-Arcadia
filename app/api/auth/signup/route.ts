import { NextResponse } from "next/server";
import { signupSchema } from "@/schemas/otp";
import { generateOtp } from "@/lib/otp";
import { hashOtp } from "@/lib/otp-hash";
import { getAppEnv } from "@/lib/env";
import { storeOtpRequest } from "@/services/otp";
import { sendOtpEmail } from "@/lib/email";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { email, password, username } = parsed.data;

  try {
    const appEnv = getAppEnv();
    const otp = generateOtp();
    const hash = await hashOtp(otp, appEnv.otpSecret);

    // Store OTP with password and username temporarily
    await storeOtpRequest(email, hash, password, username);
    await sendOtpEmail(email, otp);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[signup] Error:", err);
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : "Failed to send OTP" 
    }, { status: 500 });
  }
}
