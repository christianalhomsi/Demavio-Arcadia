import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { permissionForPath } from "@/components/shell/nav";
import { Skeleton } from "@/components/ui/skeleton";
import { listDeviceStatus } from "@/features/devices/queries";
import { SessionsBoard } from "@/features/sessions/components/SessionsBoard";
import { getServerNow, listSessions } from "@/features/sessions/queries";
import { listPackages } from "@/features/packages/queries";
import { listProducts } from "@/features/products/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Sessions" };

async function Sessions({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  const { membership } = await requireHallPermission(hallId, permissionForPath("/sessions"));
  const canSell = membership.permissions.includes("product.sell");
  const [sessions, devices, serverNow, products, packages] = await Promise.all([
    listSessions(hallId, { activeOnly: true, limit: 100, offset: 0 }),
    listDeviceStatus(hallId),
    getServerNow(),
    canSell ? listProducts(hallId) : null,
    listPackages(hallId),
  ]);
  if (!sessions || !devices) return <ErrorState message={(await getT()).t.ssLoadFail} />;

  return (
    <SessionsBoard
      hallId={hallId}
      sessions={sessions.rows}
      serverNow={serverNow}
      products={products ?? []}
      packages={(packages ?? []).filter((p) => p.active)}
      devices={devices.map((d) => ({
        id: d.deviceId,
        name: d.name,
        available: d.effectiveAvailability === "available",
      }))}
    />
  );
}

export default function SessionsPage({ params }: PageProps<"/halls/[hallId]/sessions">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Sessions params={params} />
    </Suspense>
  );
}
