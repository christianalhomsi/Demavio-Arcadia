import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { assertSuperAdmin } from "@/lib/admin-auth";

export async function PATCH(request: Request) {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { reservation_id, status } = body ?? {};

  if (!reservation_id || !["confirmed", "cancelled"].includes(status)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // تحقق إن المستخدم staff في نفس الصالة تبع الحجز
  const { data: reservation } = await supabase
    .from("reservations")
    .select("id, device_id, status")
    .eq("id", reservation_id)
    .single();

  if (!reservation) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  if (reservation.status !== "pending") {
    return NextResponse.json({ error: "Only pending reservations can be updated" }, { status: 422 });
  }

  const { data: device } = await supabase
    .from("devices")
    .select("hall_id")
    .eq("id", reservation.device_id)
    .single();

  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  const { data: assignment } = await supabase
    .from("staff_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("hall_id", device.hall_id)
    .maybeSingle();

  // السماح للـ super_admin كمان
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!assignment && profile?.role !== "super_admin") {
    return NextResponse.json({ error: "No access" }, { status: 403 });
  }

  const admin = getAdminClient();
  const { error } = await admin
    .from("reservations")
    .update({ status })
    .eq("id", reservation_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
