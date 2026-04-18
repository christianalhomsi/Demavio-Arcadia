import { NextResponse } from "next/server";
import { getAppEnv } from "@/lib/env";
import { markOfflineDevices } from "@/lib/jobs/mark-offline-devices";
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

  const { searchParams } = new URL(request.url);
  const timeoutMinutes = Number(searchParams.get("timeout_minutes")) || undefined;

  try {
    const result = await markOfflineDevices(timeoutMinutes);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[job:mark-offline-devices]", err);
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
