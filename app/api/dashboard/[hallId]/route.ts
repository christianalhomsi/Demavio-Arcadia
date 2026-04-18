import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  const supabase = await getServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [devicesRes, reservationsRes] = await Promise.all([
    supabase.from("devices").select("id, name, status, last_heartbeat").eq("hall_id", hallId),
    supabase.from("reservations")
      .select("id, start_time, end_time, status, devices!inner(name, hall_id)")
      .eq("devices.hall_id", hallId)
      .order("start_time", { ascending: false })
      .limit(5),
  ]);

  return NextResponse.json({
    devices:      devicesRes.data      ?? [],
    reservations: reservationsRes.data ?? [],
  });
}
