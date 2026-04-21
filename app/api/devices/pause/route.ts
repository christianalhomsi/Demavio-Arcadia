import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit";
import { verifyStaffHallAccess } from "@/services";
import { z } from "zod";

const pauseSchema = z.object({
  device_id: z.string().uuid(),
  hall_id: z.string().uuid(),
  paused: z.boolean(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const parsed = pauseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { device_id, hall_id, paused } = parsed.data;

  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify staff or admin has access to this hall
  const accessResult = await verifyStaffHallAccess(user.id, hall_id);
  if (!accessResult.success) {
    return NextResponse.json({ error: accessResult.error }, { status: 403 });
  }

  // Get current device status
  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .select("id, hall_id, status")
    .eq("id", device_id)
    .single();

  if (deviceError || !device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  if (device.hall_id !== hall_id) {
    return NextResponse.json(
      { error: "Device does not belong to the specified hall" },
      { status: 422 }
    );
  }

  // Determine new status
  let newStatus: string;
  if (paused) {
    newStatus = "paused";
  } else {
    // When resuming, check if there's an active session
    const { data: activeSession } = await supabase
      .from("sessions")
      .select("id")
      .eq("device_id", device_id)
      .is("ended_at", null)
      .single();

    // Check if there's a pending reservation
    const { data: pendingReservation } = await supabase
      .from("reservations")
      .select("id")
      .eq("device_id", device_id)
      .eq("status", "confirmed")
      .gte("end_time", new Date().toISOString())
      .single();

    if (activeSession) {
      newStatus = "active";
    } else if (pendingReservation) {
      newStatus = "idle";
    } else {
      newStatus = "available";
    }
  }

  // Update device status using admin client to bypass RLS
  const adminClient = getAdminClient();
  const { error: updateError } = await adminClient
    .from("devices")
    .update({ status: newStatus })
    .eq("id", device_id);

  if (updateError) {
    console.error("Device update error:", updateError);
    return NextResponse.json(
      { error: `Failed to update device status: ${updateError.message}` },
      { status: 500 }
    );
  }

  // Audit log
  writeAuditLog({
    user_id: user.id,
    action: "update",
    entity_type: "device",
    entity_id: device_id,
    old_data: { status: device.status },
    new_data: { status: newStatus, paused },
  });

  return NextResponse.json({ status: newStatus }, { status: 200 });
}
