import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;
  const { searchParams } = new URL(request.url);
  const hallId = searchParams.get("hall_id");

  if (!hallId) {
    return NextResponse.json({ error: "hall_id required" }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Get device type
  const { data: device } = await supabase
    .from("devices")
    .select("device_type_id")
    .eq("id", deviceId)
    .single();

  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  // Get price from hall_devices
  const { data: hallDevice } = await supabase
    .from("hall_devices")
    .select("price_per_hour")
    .eq("hall_id", hallId)
    .eq("device_type_id", device.device_type_id)
    .single();

  return NextResponse.json({
    price_per_hour: hallDevice?.price_per_hour || 0,
  });
}
