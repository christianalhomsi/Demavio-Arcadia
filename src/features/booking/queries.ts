import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Interval, WorkingRange } from "./slots";

export interface PublicHall {
  id: string;
  name: string;
  timeZone: string;
  deviceCount: number;
}

export interface PublicHallDetail {
  id: string;
  name: string;
  timeZone: string;
  currency: string;
  hours: WorkingRange[];
}

export interface PublicDevice {
  id: string;
  name: string;
  deviceType: "pc" | "console";
  category: string | null;
  /** Player counts the device is priced by (e.g. [2, 4]); empty for flat-priced devices. */
  playerOptions: number[];
}

export interface Quote {
  currency: string;
  ratePerHourMinor: number;
  estimatedMinor: number;
}

export interface MyReservation {
  id: string;
  hallName: string;
  timeZone: string;
  deviceName: string;
  startAt: string;
  endAt: string;
  status: "pending" | "confirmed" | "checked_in" | "canceled" | "no_show";
  playersCount: number | null;
  canCancel: boolean;
}

/** Public reads: these RPCs are granted to `anon` and return only non-sensitive columns. */
export async function listPublicHalls(): Promise<PublicHall[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_public_halls");
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    timeZone: r.time_zone as string,
    deviceCount: (r.device_count as number) ?? 0,
  }));
}

export async function getPublicHall(hallId: string): Promise<PublicHallDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_hall", { p_hall_id: hallId });
  const r = (data as Record<string, unknown>[] | null)?.[0];
  if (error || !r) return null;
  return {
    id: r.id as string,
    name: r.name as string,
    timeZone: r.time_zone as string,
    currency: String(r.currency).trim(),
    hours: ((r.working_hours as WorkingRange[] | null) ?? []).map((h) => ({
      weekday: h.weekday,
      opens: h.opens,
      closes: h.closes,
    })),
  };
}

export async function listPublicDevices(hallId: string): Promise<PublicDevice[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_public_devices", { p_hall_id: hallId });
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    deviceType: r.device_type as "pc" | "console",
    category: (r.category as string | null) ?? null,
    playerOptions: ((r.player_options as number[] | null) ?? []).map(Number),
  }));
}

export async function listDeviceBusy(
  deviceId: string,
  from: Date,
  to: Date,
): Promise<Interval[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_public_device_busy", {
    p_device_id: deviceId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    start: Date.parse(r.start_at as string),
    end: Date.parse(r.end_at as string),
  }));
}

/** Read-only price estimate. The real charge is computed from the session, never from this. */
export async function quotePrice(
  deviceId: string,
  players: number | null,
  start: Date,
  end: Date,
): Promise<Quote | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quote_public_price", {
    p_device_id: deviceId,
    p_players: players,
    p_start: start.toISOString(),
    p_end: end.toISOString(),
  });
  const r = (data as Record<string, unknown>[] | null)?.[0];
  if (error || !r) return null;
  return {
    currency: String(r.currency).trim(),
    ratePerHourMinor: Number(r.rate_per_hour_minor),
    estimatedMinor: Number(r.estimated_minor),
  };
}

export async function listMyReservations(): Promise<MyReservation[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_reservations");
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    hallName: r.hall_name as string,
    timeZone: r.time_zone as string,
    deviceName: r.device_name as string,
    startAt: r.start_at as string,
    endAt: r.end_at as string,
    status: r.status as MyReservation["status"],
    playersCount: (r.players_count as number | null) ?? null,
    canCancel: Boolean(r.can_cancel),
  }));
}
