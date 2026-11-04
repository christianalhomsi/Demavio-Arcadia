import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { HallRequestsList } from "@/features/sales/components/SalesPanels";
import { listHallRequests } from "@/features/sales/queries";
import { requirePlatformRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Hall requests" };

async function Requests() {
  await requirePlatformRole("super_admin");
  const result = await listHallRequests({ limit: 50, offset: 0 });
  const { t } = await getT();
  if (!result) return <ErrorState message={t.slLoadFail} />;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t.slRequestsTitle}</h1>
        <p className="mt-1 text-sm text-muted">{t.slRequestsIntro}</p>
      </div>
      <HallRequestsList requests={result.rows} timeZone="UTC" />
    </div>
  );
}

export default function AdminRequestsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <Requests />
    </Suspense>
  );
}
