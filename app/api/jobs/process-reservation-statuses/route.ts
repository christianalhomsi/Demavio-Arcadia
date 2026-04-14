import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processReservationStatuses } from "@/lib/jobs/process-reservation-statuses";
import { cancelExpiredReservations } from "@/lib/jobs/cancel-expired-reservations";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [statuses, cancelled] = await Promise.all([
      processReservationStatuses(),
      cancelExpiredReservations(),
    ]);
    return NextResponse.json({ ...statuses, cancelled: cancelled.canceled_count });
  } catch (err) {
    console.error("[job:process-reservation-statuses]", err);
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
