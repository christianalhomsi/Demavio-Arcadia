import "server-only";
import { cacheLife } from "next/cache";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Interval, WorkingRange } from "./slots";

export interface PublicHall {
  id: string;
  name: string;
  timeZone: string;
  deviceCount: number;
  coverPath: string | null;
  address: string | null;
  /** Distinct kinds of active devices (e.g. PC, PS5), for the hall card. */
  deviceKinds: string[];
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
/**
 * Public, user-independent reads (no auth.uid() inside these RPCs) are cached for a few seconds so a burst
 * of visitors costs one database call per window instead of one per page view. A cookie-less anon client is
 * used because cached functions cannot read request cookies. Errors throw so they are never cached; the
 * exported wrappers turn them into null as before. Busy slots and price quotes are NOT cached.
 */
function anonClient() {
  const { url, anonKey } = supabasePublicEnv();
  return createAnonClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function cachedPublicHalls(): Promise<PublicHall[]> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });
  const { data, error } = await anonClient().rpc("list_public_halls");
  if (error) throw new Error("list_public_halls failed");
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    timeZone: r.time_zone as string,
    deviceCount: (r.device_count as number) ?? 0,
    coverPath: (r.cover_path as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    deviceKinds: (r.device_kinds as string[] | null) ?? [],
  }));
}

export async function listPublicHalls(): Promise<PublicHall[] | null> {
  try {
    return await cachedPublicHalls();
  } catch {
    return null;
  }
}

async function cachedPublicHall(hallId: string): Promise<PublicHallDetail | null> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });
  const { data, error } = await anonClient().rpc("get_public_hall", { p_hall_id: hallId });
  if (error) throw new Error("get_public_hall failed");
  const r = (data as Record<string, unknown>[] | null)?.[0];
  if (!r) return null;
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

export async function getPublicHall(hallId: string): Promise<PublicHallDetail | null> {
  try {
    return await cachedPublicHall(hallId);
  } catch {
    return null;
  }
}

async function cachedPublicDevices(hallId: string): Promise<PublicDevice[]> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });
  const { data, error } = await anonClient().rpc("list_public_devices", { p_hall_id: hallId });
  if (error) throw new Error("list_public_devices failed");
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    deviceType: r.device_type as "pc" | "console",
    category: (r.category as string | null) ?? null,
    playerOptions: ((r.player_options as number[] | null) ?? []).map(Number),
  }));
}

export async function listPublicDevices(hallId: string): Promise<PublicDevice[] | null> {
  try {
    return await cachedPublicDevices(hallId);
  } catch {
    return null;
  }
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
