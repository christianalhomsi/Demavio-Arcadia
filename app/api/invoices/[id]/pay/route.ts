import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { verifyStaffHallAccess, createPayment, createLedgerEntry } from "@/services";
import { z } from "zod";

const payInvoiceSchema = z.object({
  payment_method: z.enum(['cash', 'wallet']),
});

// POST /api/invoices/[id]/pay
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = await request.json().catch(() => null);
  
  const parsed = payInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { payment_method } = parsed.data;
  const { id: invoiceId } = await params;

  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Check if already paid
  if (invoice.is_paid) {
    return NextResponse.json({ error: "Invoice already paid" }, { status: 400 });
  }

  // Verify staff has access to this hall
  const accessResult = await verifyStaffHallAccess(user.id, invoice.hall_id);
  if (!accessResult.success) {
    return NextResponse.json({ error: accessResult.error }, { status: 403 });
  }

  // Create payment record
  const paymentResult = await createPayment(
    invoice.session_id,
    invoice.user_id,
    invoice.total_price,
    invoice.duration_hours
  );
  if (!paymentResult.success) {
    return NextResponse.json({ error: paymentResult.error }, { status: 500 });
  }

  // Create ledger entry
  const ledgerResult = await createLedgerEntry(paymentResult.data.id, invoice.total_price);
  if (!ledgerResult.success) {
    // Compensate: delete the payment we just created
    await supabase.from("payments").delete().eq("id", paymentResult.data.id);
    return NextResponse.json({ error: ledgerResult.error }, { status: 500 });
  }

  // Atomic update: only succeeds if invoice is still unpaid (prevents double-payment race)
  const { data: updatedRows, error: updateError } = await supabase
    .from("invoices")
    .update({
      payment_id: paymentResult.data.id,
      payment_method: payment_method,
      is_paid: true,
    })
    .eq("id", invoiceId)
    .eq("is_paid", false)
    .select("id");

  if (updateError) {
    console.error("[pay-invoice] Failed to update invoice:", updateError);
    await supabase.from("ledger").delete().eq("id", ledgerResult.data.id);
    await supabase.from("payments").delete().eq("id", paymentResult.data.id);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (!updatedRows || updatedRows.length === 0) {
    // Another request already paid this invoice
    await supabase.from("ledger").delete().eq("id", ledgerResult.data.id);
    await supabase.from("payments").delete().eq("id", paymentResult.data.id);
    return NextResponse.json({ error: "Invoice already paid" }, { status: 409 });
  }

  return NextResponse.json(
    {
      invoice_id: invoiceId,
      payment_id: paymentResult.data.id,
      ledger_id: ledgerResult.data.id,
      total_price: invoice.total_price,
    },
    { status: 200 }
  );
}
