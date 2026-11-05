import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { permissionForPath } from "@/components/shell/nav";
import { TablePageSkeleton } from "@/components/ui/skeleton";
import { listDeviceStatus } from "@/features/devices/queries";
import { getHallCurrency } from "@/features/invoices/queries";
import { PackagesPanel } from "@/features/packages/components/PackagesPanel";
import { listPackages } from "@/features/packages/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Packages" };

async function Packages({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/packages"));
  const [packages, devices, currency] = await Promise.all([
    listPackages(hallId),
    listDeviceStatus(hallId),
    getHallCurrency(hallId),
  ]);
  if (!packages || !devices || !currency)
    return <ErrorState message={(await getT()).t.pkLoadFail} />;
  const categories = [...new Set(devices.map((d) => d.category).filter((c): c is string => !!c))];
  return (
    <PackagesPanel
      hallId={hallId}
      currency={currency}
      packages={packages}
      categories={categories}
    />
  );
}

export default function PackagesPage({ params }: PageProps<"/halls/[hallId]/packages">) {
  return (
    <Suspense fallback={<TablePageSkeleton cols={5} />}>
      <Packages params={params} />
    </Suspense>
  );
}
