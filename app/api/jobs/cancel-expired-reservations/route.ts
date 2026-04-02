import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { cancelExpiredReservations } from "@/lib/jobs/cancel-expired-reservations";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");

  if (auth !== `Bearer ${env.CRON_SECRET}`) {
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
