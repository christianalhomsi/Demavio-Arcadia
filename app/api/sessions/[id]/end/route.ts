import { NextResponse } from "next/server";
import { endSessionSchema } from "@/schemas/end-session";
import { getServerClient } from "@/lib/supabase/server";
import { calculateDuration, calculatePrice } from "@/lib/pricing";
import {
  verifyStaffHallAccess,
  getActiveSession,
  endSession,
  createPayment,
  createLedgerEntry,
  setDeviceAvailable,
} from "@/services";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json().catch(() => null);

  const parsed = endSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { hall_id, rate_per_hour } = parsed.data;

  // Resolve authenticated staff user
  const supabase = getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify staff has access to this hall
  const accessResult = await verifyStaffHallAccess(user.id, hall_id);
  if (!accessResult.success) {
    return NextResponse.json({ error: accessResult.error }, { status: 403 });
  }

  // Load the active session
  const sessionResult = await getActiveSession(params.id);
  if (!sessionResult.success) {
    return NextResponse.json({ error: "Active session not found" }, { status: 404 });
  }

  const session = sessionResult.data;
  const endedAt = new Date().toISOString();

  // Calculate duration and price
  const durationHours = calculateDuration(session.started_at, endedAt);
  const totalPrice = calculatePrice(durationHours, rate_per_hour);

  // Create payment record
  const paymentResult = await createPayment(
    session.id,
    session.user_id,
    totalPrice,
    durationHours
  );
  if (!paymentResult.success) {
    return NextResponse.json({ error: paymentResult.error }, { status: 500 });
  }

  // Create ledger entry
  const ledgerResult = await createLedgerEntry(paymentResult.data.id, totalPrice);
  if (!ledgerResult.success) {
    return NextResponse.json({ error: ledgerResult.error }, { status: 500 });
  }

  // Mark session as ended and reset device — run in parallel
  const [endResult, deviceResult] = await Promise.all([
    endSession(session.id, endedAt),
    setDeviceAvailable(session.device_id),
  ]);

  if (!endResult.success) {
    console.error("[end-session] endSession failed:", endResult.error);
  }
  if (!deviceResult.success) {
    console.error("[end-session] setDeviceAvailable failed:", deviceResult.error);
  }

  return NextResponse.json(
    {
      session_id: session.id,
      duration_hours: durationHours,
      total_price: totalPrice,
      payment_id: paymentResult.data.id,
      ledger_id: ledgerResult.data.id,
    },
    { status: 200 }
  );
}
