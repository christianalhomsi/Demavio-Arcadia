import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getServerClient } from "@/lib/supabase/server";
import { Settings } from "lucide-react";
import PricingEditor from "./pricing-editor";

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

  return (
    <div className="page-shell">
      <div className="flex items-center gap-2.5">
        <Settings size={18} className="text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold leading-none">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("description")}</p>
        </div>
      </div>

      <PricingEditor hallId={hallId} hallDevices={hallDevices || []} locale={locale} />
    </div>
  );
}
