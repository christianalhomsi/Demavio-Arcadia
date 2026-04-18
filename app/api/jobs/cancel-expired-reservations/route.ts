import { NextResponse } from "next/server";
import { getAppEnv } from "@/lib/env";
import { cancelExpiredReservations } from "@/lib/jobs/cancel-expired-reservations";
import crypto from "crypto";

export async function GET(request: Request) {
  const appEnv = getAppEnv();
  
  // Check that cron secret is configured
  if (!appEnv.cronSecret || appEnv.cronSecret.trim().length === 0) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  
  const auth = request.headers.get("authorization");
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

  try {
    const result = await cancelExpiredReservations();
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[job:cancel-expired-reservations]", err);
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
