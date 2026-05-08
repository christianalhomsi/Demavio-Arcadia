import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hallId: string }> }
) {
  const { hallId } = await params;
  const supabase = await getServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { pricing } = await req.json();

    // Delete existing pricing for this hall
    try {
      await supabase
        .from("device_time_pricing")
        .delete()
        .eq("hall_id", hallId);
    } catch (e) {
      // Table might not exist, continue
    }

    // Insert new pricing
    const allPricing = Object.entries(pricing).flatMap(([deviceTypeId, slots]: [string, any]) =>
      slots.map((slot: any) => ({
        hall_id: hallId,
        device_type_id: deviceTypeId,
        start_time: slot.start_time,
        end_time: slot.end_time,
        price_per_hour: slot.price_per_hour,
      }))
    );

    if (allPricing.length > 0) {
      const { error } = await supabase
        .from("device_time_pricing")
        .insert(allPricing);

      if (error) {
        console.error("Insert error:", error);
        // If table doesn't exist, return success anyway
        if (error.code === '42P01') {
          return NextResponse.json({ success: true, warning: "Time-based pricing table not created yet" });
        }
        throw error;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating time pricing:", error);
    return NextResponse.json(
      { error: "Failed to update pricing" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ hallId: string }> }
) {
  const { hallId } = await params;
  const supabase = await getServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let data = [];
    try {
      const result = await supabase
        .from("device_time_pricing")
        .select("*")
        .eq("hall_id", hallId)
        .order("device_type_id")
        .order("start_time");
      data = result.data || [];
    } catch (e) {
      // Table doesn't exist yet
      data = [];
    }

    return NextResponse.json({ pricing: data });
  } catch (error) {
    console.error("Error fetching time pricing:", error);
    return NextResponse.json(
      { error: "Failed to fetch pricing" },
      { status: 500 }
    );
  }
}
