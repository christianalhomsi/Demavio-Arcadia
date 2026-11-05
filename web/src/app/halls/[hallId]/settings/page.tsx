import { Suspense } from "react";
import { notFound } from "next/navigation";
import { permissionForPath } from "@/components/shell/nav";
import { SectionsPageSkeleton } from "@/components/ui/skeleton";
import {
  HallProfileForm,
  PoliciesForm,
  WorkingHoursEditor,
} from "@/features/halls/components/SettingsForms";
import { HallCoverForm } from "@/features/halls/components/HallCoverForm";
import { getHallSettingsBundle } from "@/features/halls/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Hall settings" };

async function Settings({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/settings"));
  const bundle = await getHallSettingsBundle(hallId);
  if (!bundle) notFound();
  const { t } = await getT();

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold">{t.cfgTitle}</h1>
      <nav aria-label={t.cfgTitle} className="-mt-6 flex flex-wrap gap-2 text-sm">
        {(
          [
            ["profile", t.cfgProfile],
            ["cover", t.cfgCover],
            ["hours", t.cfgHours],
            ["policies", t.cfgPolicies],
          ] as const
        ).map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="inline-flex min-h-10 items-center rounded-full border border-border px-4 py-1 transition-colors hover:bg-neutral-bg active:bg-neutral-bg"
          >
            {label}
          </a>
        ))}
      </nav>
      <section id="profile" aria-labelledby="profile-h" className="scroll-mt-20">
        <h2 id="profile-h" className="mb-3 text-lg font-medium">
          {t.cfgProfile}
        </h2>
        <HallProfileForm hall={bundle.hall} />
      </section>
      <section id="cover" aria-labelledby="cover-h" className="scroll-mt-20">
        <h2 id="cover-h" className="mb-3 text-lg font-medium">
          {t.cfgCover}
        </h2>
        <HallCoverForm hallId={hallId} coverPath={bundle.hall.coverPath} />
      </section>
      <section id="hours" aria-labelledby="hours-h" className="scroll-mt-20">
        <h2 id="hours-h" className="mb-3 text-lg font-medium">
          {t.cfgHours}
        </h2>
        <WorkingHoursEditor hallId={hallId} initial={bundle.hours} />
      </section>
      <section id="policies" aria-labelledby="policies-h" className="scroll-mt-20">
        <h2 id="policies-h" className="mb-3 text-lg font-medium">
          {t.cfgPolicies}
        </h2>
        <PoliciesForm hallId={hallId} settings={bundle.settings} />
      </section>
    </div>
  );
}

export default function SettingsPage({ params }: PageProps<"/halls/[hallId]/settings">) {
  return (
    <Suspense fallback={<SectionsPageSkeleton sections={3} />}>
      <Settings params={params} />
    </Suspense>
  );
}
