import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { sendReservationReminders } from "@/lib/jobs/send-reservation-reminders";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");

  if (auth !== `Bearer ${env.CRON_SECRET}`) {
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
