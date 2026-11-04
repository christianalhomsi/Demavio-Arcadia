import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface PricingRule {
  id: string;
  scope: "hall" | "category" | "device";
  deviceId: string | null;
  deviceName: string | null;
  category: string | null;
  ratePerHourMinor: number;
  playersCount: number | null;
}

export async function getPricing(hallId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_pricing", { p_hall_id: hallId });
  if (error) return null;
  const rows = (data ?? []) as Record<string, unknown>[];
  const first = rows[0];
  return {
    currency: first ? String(first.currency).trim() : null,
    incrementMinutes: first ? Number(first.increment_minutes) : null,
    minBillableMinutes: first ? Number(first.min_billable_minutes) : null,
    rules: rows.map((r): PricingRule => ({
      id: r.id as string,
      scope: r.scope as PricingRule["scope"],
      deviceId: (r.device_id as string | null) ?? null,
      deviceName: (r.device_name as string | null) ?? null,
      category: (r.category as string | null) ?? null,
      ratePerHourMinor: Number(r.rate_per_hour_minor),
      playersCount: (r.players_count as number | null) ?? null,
    })),
  };
}

export async function getBillingRules(hallId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hall_settings")
    .select("billing_increment_minutes,min_billable_minutes")
    .eq("hall_id", hallId)
    .maybeSingle();
  return data
    ? {
        incrementMinutes: Number(data.billing_increment_minutes),
        minBillableMinutes: Number(data.min_billable_minutes),
      }
    : null;
}
