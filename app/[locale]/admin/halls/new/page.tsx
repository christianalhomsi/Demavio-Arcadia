import type { Metadata } from "next";
import Link from "next/link";
import NewHallForm from "./new-hall-form";
import { ChevronLeft, Building2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Admin — New Hall" };

export default async function AdminNewHallPage() {
  const t = await getTranslations('admin');
  
  return (
    <div className="space-y-6">
      <Link href="/admin/halls"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted -ml-2 w-fit">
        <ChevronLeft size={14} />
        {t('backToHalls')}
      </Link>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "oklch(0.55 0.26 280 / 0.12)", border: "1px solid oklch(0.55 0.26 280 / 0.25)" }}>
          <Building2 size={20} style={{ color: "oklch(0.65 0.22 280)" }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('newHall')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('hallInfoDesc')}
          </p>
        </div>
      </div>

      <NewHallForm />
    </div>
  );
}
