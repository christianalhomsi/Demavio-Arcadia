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
  calculateSessionTotal,
  getOrCreateWallet,
  deductFromWallet,
} from "@/services";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = await request.json().catch(() => null);

  const parsed = endSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { hall_id, rate_per_hour, payment_method, wallet_price_per_hour } = parsed.data;
  const { id } = await params;

  // Resolve authenticated staff user
  const supabase = await getServerClient();
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
  const sessionResult = await getActiveSession(id);
  if (!sessionResult.success) {
    return NextResponse.json({ error: "Active session not found" }, { status: 404 });
  }

  const session = sessionResult.data;
  const endedAt = new Date().toISOString();

  // Calculate duration and price
  const durationHours = calculateDuration(session.started_at, endedAt);
  const effectiveRate = payment_method === 'wallet' && wallet_price_per_hour ? wallet_price_per_hour : rate_per_hour;
  const sessionPrice = calculatePrice(durationHours, effectiveRate);

  // Get session items total
  const itemsResult = await calculateSessionTotal(session.id);
  const itemsTotal = itemsResult.success ? itemsResult.data.items_total : 0;
  
  // Get session items for invoice
  const { data: sessionItems } = await supabase
    .from("session_items")
    .select("*")
    .eq("session_id", session.id);
  
  // Total price = session base cost + items
  const totalPrice = sessionPrice + itemsTotal;

  // Handle wallet payment if selected
  let walletTransactionId: string | null = null;
  if (payment_method === 'wallet') {
    if (!session.user_id) {
      // Get guest_name from reservation
      const { data: reservation } = await supabase
        .from("reservations")
        .select("guest_name")
        .eq("id", session.reservation_id)
        .single();

      if (!reservation?.guest_name) {
        return NextResponse.json({ error: "Guest name not found" }, { status: 400 });
      }

      const walletResult = await getOrCreateWallet(hall_id, null, reservation.guest_name);
      if (!walletResult.success) {
        return NextResponse.json({ error: walletResult.error }, { status: 500 });
      }

      const deductResult = await deductFromWallet(walletResult.data.id, sessionPrice, session.id, user.id);
      if (!deductResult.success) {
        return NextResponse.json({ error: deductResult.error }, { status: 400 });
      }
      walletTransactionId = deductResult.data.id;
    } else {
      const walletResult = await getOrCreateWallet(hall_id, session.user_id, null);
      if (!walletResult.success) {
        return NextResponse.json({ error: walletResult.error }, { status: 500 });
      }

      const deductResult = await deductFromWallet(walletResult.data.id, sessionPrice, session.id, user.id);
      if (!deductResult.success) {
        return NextResponse.json({ error: deductResult.error }, { status: 400 });
      }
      walletTransactionId = deductResult.data.id;
    }
  }

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

  // Create invoice record
  const { error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      session_id: session.id,
      payment_id: paymentResult.data.id,
      hall_id: hall_id,
      device_id: session.device_id,
      user_id: session.user_id,
      started_at: session.started_at,
      ended_at: endedAt,
      duration_hours: durationHours,
      rate_per_hour: effectiveRate,
      session_price: sessionPrice,
      items: sessionItems || [],
      items_total: itemsTotal,
      total_price: totalPrice,
      payment_method: payment_method || 'cash',
      wallet_transaction_id: walletTransactionId,
    });

  if (invoiceError) {
    console.error("[end-session] Failed to create invoice:", invoiceError);
  }

  return NextResponse.json(
    {
      session_id: session.id,
      duration_hours: durationHours,
      session_price: sessionPrice,
      items_total: itemsTotal,
      total_price: totalPrice,
      payment_id: paymentResult.data.id,
      ledger_id: ledgerResult.data.id,
    },
    { status: 200 }
  );
}
