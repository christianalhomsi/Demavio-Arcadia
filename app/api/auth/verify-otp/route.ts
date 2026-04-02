import { NextResponse } from "next/server";
import { otpVerifySchema } from "@/schemas/otp";
import { verifyOtp } from "@/lib/otp-hash";
import { env } from "@/lib/env";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  getLatestOtpRequest,
  incrementOtpAttempts,
  markOtpVerified,
} from "@/services/otp";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const parsed = otpVerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { email, otp } = parsed.data;

  try {
    const record = await getLatestOtpRequest(email);

    if (!record) {
      return NextResponse.json(
        { error: "No valid OTP request found" },
        { status: 404 }
      );
    }

    const valid = await verifyOtp(otp, record.otp_hash, env.OTP_SECRET);

    if (!valid) {
      await incrementOtpAttempts(record.id);
      return NextResponse.json({ error: "Invalid OTP" }, { status: 401 });
    }

    await markOtpVerified(record.id);

    // Upsert user then generate a one-time session link
    const admin = getAdminClient();

    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { shouldCreateUser: true },
      });

    if (linkError || !linkData.properties) {
      console.error("[verify-otp] generateLink error", linkError);
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 }
      );
    }

    // Return the hashed_token for the client to exchange into a full session
    // via supabase.auth.verifyOtp({ token_hash, type: "magiclink" })
    return NextResponse.json(
      { token_hash: linkData.properties.hashed_token },
      { status: 200 }
    );
  } catch (err) {
    console.error("[verify-otp]", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
