import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { markOfflineDevices } from "@/lib/jobs/mark-offline-devices";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");

  if (auth !== `Bearer ${env.CRON_SECRET}`) {
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
