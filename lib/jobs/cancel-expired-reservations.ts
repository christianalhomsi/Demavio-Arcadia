import { getAdminClient } from "@/lib/supabase/admin";

export type CancelExpiredResult = {
  canceled_count: number;
  canceled_ids: string[];
};

export async function cancelExpiredReservations(): Promise<CancelExpiredResult> {
  const supabase = getAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("reservations")
    .update({ status: "canceled" })
    .in("status", ["pending", "confirmed"])
    .lt("start_time", now)
    .select("id");

  if (error) throw new Error(`cancelExpiredReservations failed: ${error.message}`);

  const canceled_ids = (data ?? []).map((r: { id: string }) => r.id);

  return {
    canceled_count: canceled_ids.length,
    canceled_ids,
  };
}
