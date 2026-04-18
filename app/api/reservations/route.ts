import { NextResponse } from "next/server";
import { bookingSchema } from "@/schemas/booking";
import { getDevice, createReservation } from "@/services";
import { getServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { hall_id, device_id, start_time, end_time } = parsed.data;

  // Validate end > start
  if (new Date(end_time) <= new Date(start_time)) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }
  // Resolve authenticated user
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify device exists and belongs to the expected hall
  const deviceResult = await getDevice(device_id);
  if (!deviceResult.success) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }
  if (deviceResult.data.hall_id !== hall_id) {
    return NextResponse.json(
      { error: "Device does not belong to the specified hall" },
      { status: 422 }
    );
  }

  // Insert reservation — DB exclusion constraint handles overlap
  const result = await createReservation(
    { hall_id, device_id, start_time, end_time },
    user.id
  );

  if (!result.success) {
    if (result.error === "OVERLAP") {
      return NextResponse.json(
        { error: "This device is not available at the time you want" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(result.data, { status: 201 });
}

