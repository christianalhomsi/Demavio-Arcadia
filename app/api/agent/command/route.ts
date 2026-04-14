import { NextResponse } from "next/server";
import { agentCommandSchema } from "@/schemas/agent";
import { getServerClient } from "@/lib/supabase/server";
import { sendAgentCommand } from "@/lib/agent";
import { writeAuditLog } from "@/lib/audit";
import { verifyStaffHallAccess, getDevice } from "@/services";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const parsed = agentCommandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { command, device_id, hall_id, args } = parsed.data;

  // Resolve authenticated user
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

  // Verify device exists and belongs to the hall
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

  // Forward command to the agent server
  const agentResult = await sendAgentCommand({ command, device_id, hall_id, args });
  if (!agentResult.success) {
    return NextResponse.json({ error: agentResult.error }, { status: 502 });
  }

  // Audit log — non-blocking
  writeAuditLog({
    user_id: user.id,
    action: "update",
    entity_type: "device",
    entity_id: device_id,
    new_data: { command, args: args ?? null },
  });

  return NextResponse.json(agentResult.data, { status: 200 });
}

