import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface HallDetails {
  id: string;
  name: string;
  address: string | null;
  contactPhone: string | null;
  timeZone: string;
  currency: string;
  coverPath: string | null;
}

export interface HallSettings {
  checkinGraceMinutes: number;
  cancellationDeadlineMinutes: number;
  reminderMinutes: number;
  waitingListEnabled: boolean;
  allowPartialPayments: boolean;
  paymentMethods: ("cash" | "wallet")[];
}

export interface WorkingHourRange {
  weekday: number;
  opens: string;
  closes: string;
}

/** Reads through RLS: members of the hall can read; everyone else gets no rows. */
export async function getHallSettingsBundle(hallId: string) {
  const supabase = await createClient();
  const [hall, settings, hours] = await Promise.all([
    supabase
      .from("halls")
      .select("id,name,address,contact_phone,time_zone,currency,cover_path")
      .eq("id", hallId)
      .maybeSingle(),
    supabase.from("hall_settings").select("*").eq("hall_id", hallId).maybeSingle(),
    supabase
      .from("hall_working_hours")
      .select("weekday,opens,closes")
      .eq("hall_id", hallId)
      .order("weekday")
      .order("opens"),
  ]);
  if (hall.error || settings.error || hours.error || !hall.data || !settings.data) return null;

  const h = hall.data;
  const s = settings.data;
  return {
    hall: {
      id: h.id,
      name: h.name,
      address: h.address,
      contactPhone: h.contact_phone,
      timeZone: h.time_zone,
      currency: h.currency,
      coverPath: h.cover_path,
    } satisfies HallDetails,
    settings: {
      checkinGraceMinutes: s.checkin_grace_minutes,
      cancellationDeadlineMinutes: s.cancellation_deadline_minutes,
      reminderMinutes: s.reminder_minutes,
      waitingListEnabled: s.waiting_list_enabled,
      allowPartialPayments: s.allow_partial_payments,
      paymentMethods: s.payment_methods,
    } satisfies HallSettings,
    // Postgres returns time as HH:MM:SS; the UI works in HH:MM.
    hours: (hours.data ?? []).map((r) => ({
      weekday: r.weekday,
      opens: String(r.opens).slice(0, 5),
      closes: String(r.closes).slice(0, 5),
    })) satisfies WorkingHourRange[],
  };
}

export async function getHallTimeZone(hallId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("halls").select("time_zone").eq("id", hallId).maybeSingle();
  return data?.time_zone ?? "UTC";
}
