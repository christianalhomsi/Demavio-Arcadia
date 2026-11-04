import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { permissionForPath } from "@/components/shell/nav";
import { Skeleton } from "@/components/ui/skeleton";
import { DeviceGrid } from "@/features/devices/components/DeviceGrid";
import { listDeviceStatus } from "@/features/devices/queries";
import { listPackages } from "@/features/packages/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Devices" };

async function Devices({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/devices"));
  const [devices, packages] = await Promise.all([listDeviceStatus(hallId), listPackages(hallId)]);
  if (!devices) return <ErrorState message={(await getT()).t.dvLoadFail} />;
  return (
    <DeviceGrid
      hallId={hallId}
      devices={devices}
      packages={(packages ?? []).filter((p) => p.active)}
    />
  );
}

export default function DevicesPage({ params }: PageProps<"/halls/[hallId]/devices">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Devices params={params} />
    </Suspense>
  );
}
