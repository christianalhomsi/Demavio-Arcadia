import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await getServerClient();

  const itemsTotal = body.items.reduce(
    (sum: number, item: any) => sum + item.product_price * item.quantity,
    0
  );

  const { error } = await supabase
    .from("invoices")
    .update({
      items: body.items,
      items_total: itemsTotal,
      total_price: itemsTotal,
    })
    .eq("session_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
