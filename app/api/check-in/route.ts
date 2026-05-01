import { NextResponse } from "next/server";
import { checkInSchema } from "@/schemas/check-in";
import { getServerClient } from "@/lib/supabase/server";
import {
  verifyStaffHallAccess,
  getReservation,
  createSession,
  setDeviceActive,
  setReservationActive,
} from "@/services";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const parsed = checkInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { reservation_id, device_id, hall_id } = parsed.data;

  // Resolve authenticated staff user
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify staff has access to this hall
  const accessResult = await verifyStaffHallAccess(user.id, hall_id);
  if (!accessResult.success) {
    return NextResponse.json({ error: accessResult.error }, { status: 403 });
  }

  // Validate reservation exists and belongs to the correct device
  const reservationResult = await getReservation(reservation_id);
  if (!reservationResult.success) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  const reservation = reservationResult.data;
  if (reservation.device_id !== device_id) {
    return NextResponse.json(
      { error: "Reservation does not match the specified device" },
      { status: 422 }
    );
  }

  // Only confirmed reservations can be checked in
  if (reservation.status !== "confirmed") {
    // If reservation is active but has no session, reset it to confirmed
    if (reservation.status === "active") {
      const { data: existingSessionCheck } = await supabase
        .from("sessions")
        .select("id")
        .eq("reservation_id", reservation_id)
        .is("ended_at", null)
        .maybeSingle();
      
      if (!existingSessionCheck) {
        // No active session found, reset to confirmed
        await supabase
          .from("reservations")
          .update({ status: "confirmed" })
          .eq("id", reservation_id);
        
        // Continue with check-in
      } else {
        return NextResponse.json(
          { error: "Reservation already has an active session" },
          { status: 409 }
        );
      }
    } else {
      return NextResponse.json(
        { error: `Cannot check in a reservation with status '${reservation.status}'` },
        { status: 422 }
      );
    }
  }

  // Prevent double session on the same device
  const { data: existingSession, error: sessionCheckErr } = await supabase
    .from("sessions")
    .select("id")
    .eq("device_id", device_id)
    .is("ended_at", null)
    .maybeSingle();

  if (sessionCheckErr) {
    return NextResponse.json({ error: "Failed to check device session status" }, { status: 500 });
  }

  if (existingSession) {
    return NextResponse.json(
      { error: "Device already has an active session" },
      { status: 409 }
    );
  }

  // Create session — unique partial index on sessions(device_id) WHERE ended_at IS NULL
  // guards against TOCTOU race; handle constraint violation as 409
  const sessionResult = await createSession(reservation_id, device_id, reservation.user_id, hall_id);
  if (!sessionResult.success) {
    if (sessionResult.error?.includes("unique") || sessionResult.error?.includes("duplicate")) {
      return NextResponse.json({ error: "Device already has an active session" }, { status: 409 });
    }
    return NextResponse.json({ error: sessionResult.error }, { status: 500 });
  }

  // Update device and reservation status — non-blocking failures are logged only
  const [deviceUpdate, reservationUpdate] = await Promise.all([
    setDeviceActive(device_id),
    setReservationActive(reservation_id),
  ]);

  if (!deviceUpdate.success) {
    console.error("[check-in] setDeviceActive failed:", deviceUpdate.error);
  }
  if (!reservationUpdate.success) {
    console.error("[check-in] setReservationActive failed:", reservationUpdate.error);
  }

  return NextResponse.json(sessionResult.data, { status: 201 });
}

