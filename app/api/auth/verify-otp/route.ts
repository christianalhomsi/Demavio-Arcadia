import { NextResponse } from "next/server";
import { otpVerifySchema } from "@/schemas/otp";
import { verifyOtp } from "@/lib/otp-hash";
import { getAppEnv } from "@/lib/env";
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
    const appEnv = getAppEnv();
    const record = await getLatestOtpRequest(email);

    if (!record) {
      return NextResponse.json(
        { error: "No valid OTP request found" },
        { status: 404 }
      );
    }

    const valid = await verifyOtp(otp, record.otp_hash, appEnv.otpSecret);

    if (!valid) {
      await incrementOtpAttempts(record.id);
      return NextResponse.json({ error: "Invalid OTP" }, { status: 401 });
    }

    await markOtpVerified(record.id);

    const admin = getAdminClient();

    // If password exists, create user with password
    if (record.password_hash) {
      const { data: authData, error: signupError } = await admin.auth.admin.createUser({
        email,
        password: record.password_hash,
        email_confirm: true,
      });

      if (signupError) {
        console.error("[verify-otp] createUser error", signupError);
        return NextResponse.json(
          { error: "Failed to create account" },
          { status: 500 }
        );
      }

      // Set role to player and username
      await admin.from("profiles").update({ 
        role: "player",
        username: record.username 
      }).eq("id", authData.user.id);

      // Generate session link
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

      if (linkError || !linkData.properties) {
        console.error("[verify-otp] generateLink error", linkError);
        return NextResponse.json(
          { error: "Failed to create session" },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { token_hash: linkData.properties.hashed_token },
        { status: 200 }
      );
    }

    // Original OTP login flow
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: {},
      });

    if (linkError || !linkData.properties) {
      console.error("[verify-otp] generateLink error", linkError);
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { token_hash: linkData.properties.hashed_token },
      { status: 200 }
    );
  } catch (err) {
    console.error("[verify-otp]", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
