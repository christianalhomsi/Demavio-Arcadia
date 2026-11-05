import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface PackageRow {
  id: string;
  name: string;
  durationMinutes: number;
  priceMinor: number;
  deviceId: string | null;
  deviceName: string | null;
  category: string | null;
  fromMinute: number | null;
  toMinute: number | null;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  uses: number;
  active: boolean;
  currency: string;
}

export interface PackageUseRow {
  id: string;
  sessionId: string;
  deviceName: string;
  priceMinor: number;
  durationMinutes: number;
  usedByName: string | null;
  createdAt: string;
}

/** Managers and people who start sessions see the same list (the database decides who may). */
export async function listPackages(hallId: string): Promise<PackageRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_packages", { p_hall_id: hallId });
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    durationMinutes: Number(r.duration_minutes),
    priceMinor: Number(r.price_minor),
    deviceId: (r.device_id as string | null) ?? null,
    deviceName: (r.device_name as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    fromMinute: r.from_minute == null ? null : Number(r.from_minute),
    toMinute: r.to_minute == null ? null : Number(r.to_minute),
    validFrom: (r.valid_from as string | null) ?? null,
    validUntil: (r.valid_until as string | null) ?? null,
    maxUses: r.max_uses == null ? null : Number(r.max_uses),
    uses: Number(r.uses),
    active: Boolean(r.active),
    currency: String(r.currency).trim(),
  }));
}

export async function listPackageUses(packageId: string): Promise<PackageUseRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_package_uses", { p_package_id: packageId });
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    sessionId: r.session_id as string,
    deviceName: r.device_name as string,
    priceMinor: Number(r.price_minor),
    durationMinutes: Number(r.duration_minutes),
    usedByName: (r.used_by_name as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}
