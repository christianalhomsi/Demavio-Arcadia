import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormPageSkeleton } from "@/components/ui/skeleton";
import { DeviceForm } from "@/features/devices/components/DeviceForm";
import { getDeviceStatus } from "@/features/devices/queries";
import { CAPABILITIES } from "@/features/devices/schemas";
import { isUuid } from "@/lib/auth/authorize";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { tpl } from "@/lib/i18n/messages";

export const metadata = { title: "Edit device" };

async function EditDevice({ params }: { params: Promise<{ hallId: string; deviceId: string }> }) {
  const { hallId, deviceId } = await params;
  await requireHallPermission(hallId, "hall.settings.manage");
  if (!isUuid(deviceId)) notFound();
  const device = await getDeviceStatus(hallId, deviceId);
  if (!device) notFound();
  const { t } = await getT();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{tpl(t.dvEditN, { name: device.name })}</h1>
      <DeviceForm
        hallId={hallId}
        deviceId={deviceId}
        initial={{
          name: device.name,
          deviceType: device.deviceType,
          category: device.category ?? "",
          capabilities: device.capabilities.filter((c): c is (typeof CAPABILITIES)[number] =>
            (CAPABILITIES as readonly string[]).includes(c),
          ),
          status: device.operationalStatus,
        }}
      />
    </div>
  );
}

export default function EditDevicePage({
  params,
}: PageProps<"/halls/[hallId]/devices/[deviceId]/edit">) {
  return (
    <Suspense fallback={<FormPageSkeleton fields={6} />}>
      <EditDevice params={params} />
    </Suspense>
  );
}
