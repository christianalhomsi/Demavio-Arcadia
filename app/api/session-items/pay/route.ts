import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { verifyStaffHallAccess, createPayment, createLedgerEntry, getOrCreateWallet, deductFromWallet } from "@/services";
import { z } from "zod";

const paySessionItemsSchema = z.object({
  session_id: z.string().uuid(),
  hall_id: z.string().uuid(),
  payment_method: z.enum(['cash', 'wallet']),
});

// POST /api/session-items/pay
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  
  const parsed = paySessionItemsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { session_id, hall_id, payment_method } = parsed.data;

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

  // Get session details and verify it belongs to the supplied hall
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, device_id, user_id, started_at, hall_id")
    .eq("id", session_id)
    .is("ended_at", null)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Active session not found" }, { status: 404 });
  }

  if (session.hall_id !== hall_id) {
    return NextResponse.json({ error: "Active session not found" }, { status: 404 });
  }

  // Get only unpaid session items
  const { data: sessionItems, error: itemsError } = await supabase
    .from("session_items")
    .select("*")
    .eq("session_id", session_id)
    .eq("is_paid", false);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  if (!sessionItems || sessionItems.length === 0) {
    return NextResponse.json({ error: "No items to pay for" }, { status: 400 });
  }

  // Calculate total
  const itemsTotal = sessionItems.reduce((sum, item) => sum + (item.product_price * item.quantity), 0);

  let walletTransactionId: string | null = null;

  // Handle wallet payment — deduct from wallet before creating records
  if (payment_method === 'wallet') {
    const walletResult = await getOrCreateWallet(hall_id, session.user_id, null);
    if (!walletResult.success) {
      return NextResponse.json({ error: walletResult.error }, { status: 500 });
    }
    const deductResult = await deductFromWallet(walletResult.data.id, itemsTotal, session_id, user.id);
    if (!deductResult.success) {
      return NextResponse.json({ error: deductResult.error }, { status: 400 });
    }
    walletTransactionId = deductResult.data.id;
  }

  // Create payment record
  const paymentResult = await createPayment(
    session_id,
    session.user_id,
    itemsTotal,
    0 // duration_hours is 0 for items-only payment
  );
  if (!paymentResult.success) {
    return NextResponse.json({ error: paymentResult.error }, { status: 500 });
  }

  // Create ledger entry
  const ledgerResult = await createLedgerEntry(paymentResult.data.id, itemsTotal);
  if (!ledgerResult.success) {
    return NextResponse.json({ error: ledgerResult.error }, { status: 500 });
  }

  // Create invoice for items payment
  const { error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      session_id: session_id,
      payment_id: paymentResult.data.id,
      hall_id: hall_id,
      device_id: session.device_id,
      user_id: session.user_id,
      started_at: session.started_at,
      ended_at: new Date().toISOString(),
      duration_hours: 0,
      rate_per_hour: 0,
      session_price: 0,
      items: sessionItems,
      items_total: itemsTotal,
      total_price: itemsTotal,
      payment_method: payment_method,
      wallet_transaction_id: walletTransactionId,
      is_paid: true,
    });

  if (invoiceError) {
    console.error("[pay-session-items] Failed to create invoice:", invoiceError);
    return NextResponse.json({ error: invoiceError.message }, { status: 500 });
  }

  // Mark items as paid — return warning in response if this fails
  const { error: markPaidError } = await supabase
    .from("session_items")
    .update({ is_paid: true })
    .eq("session_id", session_id)
    .eq("is_paid", false);

  if (markPaidError) {
    console.error("[pay-session-items] Failed to mark items as paid:", markPaidError);
    return NextResponse.json(
      {
        session_id: session_id,
        items_total: itemsTotal,
        payment_id: paymentResult.data.id,
        ledger_id: ledgerResult.data.id,
        warning: "Payment recorded but items could not be marked as paid: " + markPaidError.message,
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      session_id: session_id,
      items_total: itemsTotal,
      payment_id: paymentResult.data.id,
      ledger_id: ledgerResult.data.id,
    },
    { status: 200 }
  );
}
