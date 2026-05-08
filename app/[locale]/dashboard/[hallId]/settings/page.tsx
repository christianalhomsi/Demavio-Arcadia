import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getServerClient } from "@/lib/supabase/server";
import { Settings } from "lucide-react";
import SettingsContent from "./settings-content";

export const metadata: Metadata = { title: "Settings | Gaming Hub" };

export default async function SettingsPage({ params }: { params: Promise<{ hallId: string; locale: string }> }) {
  const { hallId, locale } = await params;
  const t = await getTranslations("settings");
  const supabase = await getServerClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id)
    .single();

  const isManager = profile?.role === "hall_manager" || profile?.role === "super_admin";

  // Get device types that are used in this hall
  const { data: hallDevices } = await supabase
    .from("hall_devices")
    .select(`
      id,
      device_type_id,
      price_per_hour,
      device_types!inner(id, name_ar, name_en)
    `)
    .eq("hall_id", hallId);

  // Extract unique device types
  const deviceTypes = hallDevices?.map(hd => {
    const dt = Array.isArray(hd.device_types) ? hd.device_types[0] : hd.device_types;
    return {
      id: dt.id,
      name_ar: dt.name_ar,
      name_en: dt.name_en
    };
  }).filter((dt, index, self) => 
    index === self.findIndex(t => t.id === dt.id)
  ) || [];

  // Get default pricing from hall_devices
  const defaultPricing = hallDevices?.map(hd => ({
    device_type_id: hd.device_type_id,
    price_per_hour: hd.price_per_hour
  })).filter((p, index, self) => 
    index === self.findIndex(t => t.device_type_id === p.device_type_id)
  ) || [];

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

  let staff: Array<{ user_id: string; role: string; email: string; username: string }> = [];

  if (staffAssignments && staffAssignments.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, role, username")
      .in("id", staffAssignments.map(s => s.user_id));

    staff = profiles?.map(profile => {
      const assignment = staffAssignments.find(s => s.user_id === profile.id);
      return {
        user_id: profile.id,
        role: assignment?.role || profile.role || "hall_staff",
        email: profile.email,
        username: profile.username || profile.email
      };
    }) || [];
  }

  return (
    <div className="page-shell">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "oklch(0.55 0.26 280 / 0.1)", border: "1px solid oklch(0.55 0.26 280 / 0.2)" }}>
          <Settings size={20} style={{ color: "oklch(0.55 0.26 280)" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      <SettingsContent
        hallId={hallId}
        locale={locale}
        isManager={isManager}
        deviceTypes={deviceTypes}
        defaultPricing={defaultPricing}
        workingHours={hall?.working_hours || []}
        staff={staff}
      />
    </div>
  );
}
