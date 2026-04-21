import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { verifyStaffHallAccess, getSessionItems, addSessionItem, removeSessionItem } from "@/services";
import { z } from "zod";

const sessionItemSchema = z.object({
  session_id: z.string().uuid(),
  product_id: z.string().uuid().nullable().optional(),
  product_name: z.string().min(1),
  product_price: z.number().min(0),
  quantity: z.number().int().min(1).default(1),
});

// GET /api/session-items?session_id=xxx
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify session belongs to a hall the user has access to
  const { data: session } = await supabase
    .from("sessions")
    .select("device_id, devices!inner(hall_id)")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const devices = session.devices as unknown as { hall_id: string };
  const accessResult = await verifyStaffHallAccess(user.id, devices.hall_id);
  if (!accessResult.success) {
    return NextResponse.json({ error: accessResult.error }, { status: 403 });
  }

  const result = await getSessionItems(sessionId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result.data);
}

// POST /api/session-items
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  
  const parsed = sessionItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify session belongs to a hall the user has access to
  const { data: session } = await supabase
    .from("sessions")
    .select("device_id, devices!inner(hall_id)")
    .eq("id", parsed.data.session_id)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const devices = session.devices as unknown as { hall_id: string };
  const accessResult = await verifyStaffHallAccess(user.id, devices.hall_id);
  if (!accessResult.success) {
    return NextResponse.json({ error: accessResult.error }, { status: 403 });
  }

  const result = await addSessionItem(parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result.data, { status: 201 });
}

// DELETE /api/session-items?item_id=xxx
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("item_id");

  if (!itemId) {
    return NextResponse.json({ error: "item_id is required" }, { status: 400 });
  }

  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify item belongs to a session in a hall the user has access to
  const { data: item } = await supabase
    .from("session_items")
    .select("session_id, sessions!inner(device_id, devices!inner(hall_id))")
    .eq("id", itemId)
    .single();

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const sessions = item.sessions as unknown as { devices: { hall_id: string } };
  const accessResult = await verifyStaffHallAccess(user.id, sessions.devices.hall_id);
  if (!accessResult.success) {
    return NextResponse.json({ error: accessResult.error }, { status: 403 });
  }

  const result = await removeSessionItem(itemId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
