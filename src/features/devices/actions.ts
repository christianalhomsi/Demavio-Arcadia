"use server";

import { revalidatePath } from "next/cache";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import { isUuid } from "@/lib/auth/authorize";
import {
  STAFF_COMMANDS,
  deviceSchema,
  maintenanceSchema,
  type DeviceInput,
  type MaintenanceInput,
  type StaffCommand,
} from "./schemas";

const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

export async function upsertDeviceAction(
  hallId: string,
  deviceId: string | null,
  input: DeviceInput,
): Promise<ActionResult<{ id: string }>> {
  return withPermission(hallId, "hall.settings.manage", async () => {
    const parsed = deviceSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return invalid(String(issue?.path[0] ?? "name"), issue?.message ?? "Invalid input");
    }
    const d = parsed.data;
    const r = await callRpc<string>("upsert_device", {
      p_hall_id: hallId,
      p_device_id: deviceId,
      p_name: d.name,
      p_type: d.deviceType,
      p_category: d.category,
      p_capabilities: d.capabilities,
      p_status: d.status,
    });
    if (!r.ok) {
      return r.code === "CONFLICT"
        ? invalid("name", "A device with this name already exists in this hall.")
        : r;
    }
    revalidatePath(`/halls/${hallId}/devices`);
    return { ok: true, data: { id: r.data } };
  });
}

export async function startMaintenanceAction(
  hallId: string,
  deviceId: string,
  input: MaintenanceInput,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "device.control", async () => {
    const parsed = maintenanceSchema.safeParse(input);
    if (!parsed.success)
      return invalid("reason", parsed.error.issues[0]?.message ?? "Invalid input");
    let expectedEnd: string | null = null;
    if (parsed.data.expectedEnd) {
      const t = new Date(parsed.data.expectedEnd);
      if (Number.isNaN(t.getTime())) return invalid("expectedEnd", "Enter a valid date and time");
      expectedEnd = t.toISOString();
    }
    const r = await callRpc<string>("start_maintenance", {
      p_device_id: deviceId,
      p_reason: parsed.data.reason,
      p_expected_end: expectedEnd,
    });
    if (!r.ok) return r;
    revalidatePath(`/halls/${hallId}/devices`);
    return { ok: true, data: null };
  });
}

export async function endMaintenanceAction(
  hallId: string,
  maintenanceId: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "device.control", async () => {
    const r = await callRpc<null>("end_maintenance", { p_maintenance_id: maintenanceId });
    if (r.ok) revalidatePath(`/halls/${hallId}/devices`);
    return r;
  });
}

/**
 * Requests a device command. The command is recorded as Queued; its real outcome comes from the
 * Agent later, so success here means "recorded", never "executed" (spec §15.4).
 */
export async function requestCommandAction(
  hallId: string,
  deviceId: string,
  type: StaffCommand,
  idempotencyKey: string,
): Promise<ActionResult<{ commandId: string }>> {
  return withPermission(hallId, "device.control", async () => {
    if (!STAFF_COMMANDS.includes(type)) return invalid("type", "Unsupported command");
    if (!isUuid(idempotencyKey) || !isUuid(deviceId)) return invalid("type", "Invalid request");
    const r = await callRpc<string>("request_device_command", {
      p_device_id: deviceId,
      p_type: type,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    revalidatePath(`/halls/${hallId}/commands`);
    return { ok: true, data: { commandId: r.data } };
  });
}
