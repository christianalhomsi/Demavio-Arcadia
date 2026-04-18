import { NextResponse } from "next/server";
import { getAppEnv } from "@/lib/env";
import { sendReservationReminders } from "@/lib/jobs/send-reservation-reminders";
import crypto from "crypto";

export async function GET(request: Request) {
  const appEnv = getAppEnv();
  
  // Check that cron secret is configured
  if (!appEnv.cronSecret || appEnv.cronSecret.trim().length === 0) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  
  const auth = request.headers.get("authorization")?.trim();
  const expectedAuth = `Bearer ${appEnv.cronSecret}`;
  
  // Constant-time comparison to prevent timing attacks
  if (!auth || auth.length !== expectedAuth.length) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const authBuffer = Buffer.from(auth);
  const expectedBuffer = Buffer.from(expectedAuth);
  
  if (!crypto.timingSafeEqual(authBuffer, expectedBuffer)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const windowMinutes = Number(searchParams.get("window_minutes")) || undefined;

  try {
    const result = await sendReservationReminders(windowMinutes);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[job:send-reservation-reminders]", err);
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
