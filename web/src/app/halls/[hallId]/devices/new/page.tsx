import { Suspense } from "react";
import { FormPageSkeleton } from "@/components/ui/skeleton";
import { DeviceForm } from "@/features/devices/components/DeviceForm";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Add device" };

async function NewDevice({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  await requireHallPermission(hallId, "hall.settings.manage");
  const { t } = await getT();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t.dvAdd}</h1>
      <DeviceForm hallId={hallId} deviceId={null} />
    </div>
  );
}

export default function NewDevicePage({ params }: PageProps<"/halls/[hallId]/devices/new">) {
  return (
    <Suspense fallback={<FormPageSkeleton fields={6} />}>
      <NewDevice params={params} />
    </Suspense>
  );
}
