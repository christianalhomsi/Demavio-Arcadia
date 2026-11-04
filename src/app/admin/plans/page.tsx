import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { AddPlanButton, PlansList } from "@/features/admin/components/SubscriptionPlansPanels";
import { listSubscriptionPlans } from "@/features/admin/queries";
import { requirePlatformRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Subscription prices" };

async function Plans() {
  await requirePlatformRole("super_admin");
  const plans = await listSubscriptionPlans();
  const { t } = await getT();
  if (!plans) return <ErrorState message={t.spLoadFail} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{t.spTitle}</h1>
          <p className="mt-1 text-sm text-muted">{t.spIntro}</p>
        </div>
        <AddPlanButton />
      </div>
      <PlansList plans={plans} />
    </div>
  );
}

export default function PlansPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <Plans />
    </Suspense>
  );
}
