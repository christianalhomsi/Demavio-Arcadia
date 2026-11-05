import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface PricingWindow {
  id: string;
  scope: "hall" | "category" | "device";
  deviceId: string | null;
  deviceName: string | null;
  category: string | null;
  /** ISO weekdays: 1 = Monday ... 7 = Sunday. */
  days: number[];
  startMinute: number;
  endMinute: number;
  ratePerHourMinor: number;
}

export async function listPricingWindows(hallId: string): Promise<PricingWindow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_pricing_windows", { p_hall_id: hallId });
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    scope: r.scope as PricingWindow["scope"],
    deviceId: (r.device_id as string | null) ?? null,
    deviceName: (r.device_name as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    days: ((r.days as number[]) ?? []).map(Number),
    startMinute: Number(r.start_minute),
    endMinute: Number(r.end_minute),
    ratePerHourMinor: Number(r.rate_per_hour_minor),
  }));
}
