import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hallId = searchParams.get("hall_id");
  const deviceTypeId = searchParams.get("device_type_id");
  const time = searchParams.get("time") || new Date().toTimeString().slice(0, 5);
  const playersCount = parseInt(searchParams.get("players_count") || "2");

  if (!hallId || !deviceTypeId) {
    return NextResponse.json(
      { error: "hall_id and device_type_id required" },
      { status: 400 }
    );
  }

  const supabase = getAdminClient();

  const { data, error } = await supabase.rpc("get_current_device_price", {
    p_device_type_id: deviceTypeId,
    p_hall_id: hallId,
    p_time: time,
    p_players_count: playersCount,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    price_per_hour: data || 0,
    players_count: playersCount,
  });
}
