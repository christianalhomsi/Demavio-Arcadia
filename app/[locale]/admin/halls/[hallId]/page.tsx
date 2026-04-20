import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getServerClient } from "@/lib/supabase/server";
import { getDeviceTypes, getHallDevices } from "@/services/device-types";
import EditHallForm from "./edit-hall-form";
import { ChevronLeft, Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Admin — Edit Hall" };

export default async function EditHallPage({ params }: { params: Promise<{ hallId: string; locale: string }> }) {
  const { hallId, locale } = await params;
  const t = await getTranslations("admin");
  const supabase = await getServerClient();

  const { data: hall } = await supabase
    .from("halls")
    .select("id, name, address, working_hours")
    .eq("id", hallId)
    .single();

  if (!hall) notFound();

  const deviceTypes = await getDeviceTypes();
  const hallDevices = await getHallDevices(hallId);
  
  console.log("📊 Device Types:", deviceTypes.length);
  console.log("🎮 Hall Devices:", hallDevices.length, hallDevices);

  return (
    <div className="space-y-6 pb-8">
      <Link href="/admin/halls"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted -ml-2 w-fit">
        <ChevronLeft size={14} />
        {t("backToHalls")}
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "oklch(0.55 0.26 280 / 0.12)", border: "1px solid oklch(0.55 0.26 280 / 0.25)" }}>
          <Pencil size={18} style={{ color: "oklch(0.65 0.22 280)" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("editHall")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("updateHallDesc")}</p>
        </div>
      </div>

      <EditHallForm
        hallId={hall.id}
        defaultName={hall.name}
        defaultAddress={hall.address ?? ""}
        defaultWorkingHours={hall.working_hours}
        deviceTypes={deviceTypes}
        hallDevices={hallDevices}
        locale={locale}
      />
    </div>
  );
}
