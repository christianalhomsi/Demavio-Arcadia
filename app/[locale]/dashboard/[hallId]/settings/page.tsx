import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getServerClient } from "@/lib/supabase/server";
import { Settings } from "lucide-react";
import PricingEditor from "./pricing-editor";
import WorkingHoursSection from "./working-hours-section";
import StaffSection from "./staff-section";

export const metadata: Metadata = { title: "Settings | Gaming Hub" };

export default async function SettingsPage({ params }: { params: Promise<{ hallId: string; locale: string }> }) {
  const { hallId, locale } = await params;
  const t = await getTranslations("settings");
  const supabase = await getServerClient();

  const { data: rawData } = await supabase
    .from("hall_devices")
    .select(`
      id,
      device_type_id,
      price_per_hour,
      device_types!inner(id, name_ar, name_en)
    `)
    .eq("hall_id", hallId);

  const hallDevices = rawData?.map(item => ({
    ...item,
    device_types: Array.isArray(item.device_types) ? item.device_types[0] : item.device_types
  }));

  const { data: hall } = await supabase
    .from("halls")
    .select("working_hours")
    .eq("id", hallId)
    .single();

  // Get staff from staff_assignments
  const { data: staffAssignments } = await supabase
    .from("staff_assignments")
    .select("user_id, role")
    .eq("hall_id", hallId);

  // Get staff from staff_hall_access (legacy)
  const { data: hallAccess } = await supabase
    .from("staff_hall_access")
    .select("user_id")
    .eq("hall_id", hallId);

  // Combine all user IDs
  const allUserIds = new Set([
    ...(staffAssignments?.map(s => s.user_id) || []),
    ...(hallAccess?.map(s => s.user_id) || [])
  ]);

  let staff: Array<{ user_id: string; role: string; email: string }> = [];

  if (allUserIds.size > 0) {
    // Get profiles for all users
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, role")
      .in("id", Array.from(allUserIds));

    // Map staff with their profiles
    staff = profiles?.map(profile => {
      const assignment = staffAssignments?.find(s => s.user_id === profile.id);
      return {
        user_id: profile.id,
        role: assignment?.role || profile.role || "hall_staff",
        email: profile.email
      };
    }) || [];
  }

  return (
    <div className="page-shell">
      <div className="flex items-center gap-2.5">
        <Settings size={18} className="text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold leading-none">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("description")}</p>
        </div>
      </div>

      <StaffSection staff={staff} />
      <WorkingHoursSection hallId={hallId} initialHours={hall?.working_hours || []} />
      <PricingEditor hallId={hallId} hallDevices={hallDevices || []} locale={locale} />
    </div>
  );
}
