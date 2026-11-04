import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { HallRequestsList, RequestHallButton } from "@/features/sales/components/SalesPanels";
import { listSubscriptionPlans } from "@/features/admin/queries";
import { listHallRequests } from "@/features/sales/queries";
import { requirePlatformRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Hall requests" };

async function Requests() {
  const ctx = await requirePlatformRole(["sales_agent", "sales_admin"]);
  const [result, plans] = await Promise.all([
    listHallRequests({ limit: 50, offset: 0 }),
    listSubscriptionPlans(),
  ]);
  const { t } = await getT();
  if (!result) return <ErrorState message={t.slLoadFail} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <h1 className="text-2xl font-semibold">{t.slRequestsTitle}</h1>
          <p className="mt-1 text-sm text-muted">{t.slRequestsIntro}</p>
        </div>
        {!ctx.platform_roles.includes("sales_admin") && <RequestHallButton plans={plans ?? []} />}
      </div>
      <HallRequestsList requests={result.rows} timeZone="UTC" />
    </div>
  );
}

export default function SalesRequestsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <Requests />
    </Suspense>
  );
}
