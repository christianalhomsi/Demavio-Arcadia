import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AgentStatus = "online" | "offline" | "none";
export type Availability = "available" | "in_use" | "maintenance" | "disabled";

export interface DeviceStatus {
  deviceId: string;
  hallId: string;
  name: string;
  deviceType: "pc" | "console";
  category: string | null;
  capabilities: string[];
  operationalStatus: "active" | "disabled";
  maintenanceStatus: "none" | "in_maintenance";
  maintenanceId: string | null;
  maintenanceReason: string | null;
  maintenanceExpectedEnd: string | null;
  agentId: string | null;
  agentVersion: string | null;
  lastHeartbeatAt: string | null;
  agentSyncState: string | null;
  agentLastError: string | null;
  agentStatus: AgentStatus;
  effectiveAvailability: Availability;
  currentSessionId: string | null;
  currentSessionType: "fixed" | "open" | null;
  currentSessionStartedAt: string | null;
  currentSessionEndsAt: string | null;
  nextReservationAt: string | null;
}

type Row = Record<string, unknown>;

function toDeviceStatus(r: Row): DeviceStatus {
  return {
    deviceId: r.device_id as string,
    hallId: r.hall_id as string,
    name: r.name as string,
    deviceType: r.device_type as DeviceStatus["deviceType"],
    category: (r.category as string | null) ?? null,
    capabilities: (r.capabilities as string[]) ?? [],
    operationalStatus: r.operational_status as DeviceStatus["operationalStatus"],
    maintenanceStatus: r.maintenance_status as DeviceStatus["maintenanceStatus"],
    maintenanceId: (r.maintenance_id as string | null) ?? null,
    maintenanceReason: (r.maintenance_reason as string | null) ?? null,
    maintenanceExpectedEnd: (r.maintenance_expected_end as string | null) ?? null,
    agentId: (r.agent_id as string | null) ?? null,
    agentVersion: (r.agent_version as string | null) ?? null,
    lastHeartbeatAt: (r.last_heartbeat_at as string | null) ?? null,
    agentSyncState: (r.agent_sync_state as string | null) ?? null,
    agentLastError: (r.agent_last_error as string | null) ?? null,
    agentStatus: r.agent_status as AgentStatus,
    effectiveAvailability: r.effective_availability as Availability,
    currentSessionId: (r.current_session_id as string | null) ?? null,
    currentSessionType: (r.current_session_type as DeviceStatus["currentSessionType"]) ?? null,
    currentSessionStartedAt: (r.current_session_started_at as string | null) ?? null,
    currentSessionEndsAt: (r.current_session_ends_at as string | null) ?? null,
    nextReservationAt: (r.next_reservation_at as string | null) ?? null,
  };
}

/** Reads the RLS-protected live view; the database decides availability and Agent state. */
export async function listDeviceStatus(hallId: string): Promise<DeviceStatus[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_device_live_status")
    .select("*")
    .eq("hall_id", hallId)
    .order("name");
  return error ? null : (data ?? []).map(toDeviceStatus);
}

export async function getDeviceStatus(
  hallId: string,
  deviceId: string,
): Promise<DeviceStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_device_live_status")
    .select("*")
    .eq("hall_id", hallId)
    .eq("device_id", deviceId)
    .maybeSingle();
  return error || !data ? null : toDeviceStatus(data);
}

export interface MaintenanceRecord {
  id: string;
  reason: string;
  startedAt: string;
  expectedEnd: string | null;
  endedAt: string | null;
}

export async function listMaintenanceHistory(deviceId: string): Promise<MaintenanceRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("device_maintenance")
    .select("id,reason,started_at,expected_end,ended_at")
    .eq("device_id", deviceId)
    .order("started_at", { ascending: false })
    .limit(10);
  return (data ?? []).map((r) => ({
    id: r.id,
    reason: r.reason,
    startedAt: r.started_at,
    expectedEnd: r.expected_end,
    endedAt: r.ended_at,
  }));
}

export interface CommandRow {
  id: string;
  deviceId: string;
  deviceName: string;
  type: string;
  status: string;
  requestedBy: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listCommands(
  hallId: string,
  opts: { limit: number; offset: number; deviceId?: string; status?: string; type?: string },
): Promise<{ rows: CommandRow[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_agent_commands", {
    p_hall_id: hallId,
    p_device_id: opts.deviceId ?? null,
    p_status: opts.status ?? null,
    p_type: opts.type ?? null,
    p_limit: opts.limit,
    p_offset: opts.offset,
  });
  if (error) return null;
  const rows = (data ?? []) as Row[];
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    rows: rows.map((r) => ({
      id: r.id as string,
      deviceId: r.device_id as string,
      deviceName: r.device_name as string,
      type: r.command_type as string,
      status: r.status as string,
      requestedBy: (r.requested_by_name as string | null) ?? null,
      errorMessage: (r.error_message as string | null) ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    })),
  };
}

export interface CommandEvent {
  id: string;
  status: string;
  detail: string | null;
  createdAt: string;
}

export async function listCommandEvents(
  commandIds: string[],
): Promise<Record<string, CommandEvent[]>> {
  if (commandIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_command_events")
    .select("id,command_id,status,detail,created_at")
    .in("command_id", commandIds)
    .order("created_at");
  const out: Record<string, CommandEvent[]> = {};
  for (const e of data ?? []) {
    (out[e.command_id] ??= []).push({
      id: e.id,
      status: e.status,
      detail: e.detail,
      createdAt: e.created_at,
    });
  }
  return out;
}
