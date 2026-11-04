import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HallTime } from "@/components/domain/HallTime";
import { PermissionGate } from "@/components/domain/PermissionGate";
import { permissionForPath } from "@/components/shell/nav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DeviceActions } from "@/features/devices/components/DeviceActions";
import { AgentBadge, AvailabilityBadge } from "@/features/devices/components/StatusBadges";
import { getDeviceStatus, listMaintenanceHistory } from "@/features/devices/queries";
import { getHallTimeZone } from "@/features/halls/queries";
import { isUuid } from "@/lib/auth/authorize";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { LiveRefresh } from "@/lib/realtime/LiveRefresh";

export const metadata = { title: "Device" };

async function Device({ params }: { params: Promise<{ hallId: string; deviceId: string }> }) {
  const { hallId, deviceId } = await params;
  await requireHallPermission(hallId, permissionForPath("/devices"));
  if (!isUuid(deviceId)) notFound();

  const [device, history, tz] = await Promise.all([
    getDeviceStatus(hallId, deviceId),
    listMaintenanceHistory(deviceId),
    getHallTimeZone(hallId),
  ]);
  if (!device) notFound();
  const { t } = await getT();

  return (
    <div className="space-y-8">
      <LiveRefresh hallId={hallId} tables={["devices", "device_maintenance", "agents"]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{device.name}</h1>
          <p className="text-sm text-muted">
            {device.deviceType === "pc" ? t.dvGamingPC : t.dvConsole}
            {device.category ? ` · ${device.category}` : ""}
          </p>
        </div>
        <PermissionGate permission="hall.settings.manage">
          <Button asChild variant="secondary">
            <Link href={`/halls/${hallId}/devices/${deviceId}/edit`}>{t.dvEdit}</Link>
          </Button>
        </PermissionGate>
      </div>

      <section
        aria-labelledby="state-h"
        className="rounded-2xl border border-border bg-surface shadow-card p-4"
      >
        <h2 id="state-h" className="mb-3 font-medium">
          {t.cmStatus}
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">{t.dvAvailability}</dt>
            <dd className="mt-1">
              <AvailabilityBadge value={device.effectiveAvailability} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t.dvAgent}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <AgentBadge value={device.agentStatus} />
              {device.agentVersion && (
                <span className="text-xs text-muted">v{device.agentVersion}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t.dvLastHeartbeat}</dt>
            <dd className="mt-1">
              {device.lastHeartbeatAt ? (
                <HallTime value={device.lastHeartbeatAt} timeZone={tz} showZone />
              ) : (
                t.cmNever
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t.dvSyncState}</dt>
            <dd className="mt-1 capitalize">{device.agentSyncState?.replace("_", " ") ?? "—"}</dd>
          </div>
          {device.agentLastError && (
            <div className="sm:col-span-2">
              <dt className="text-muted">{t.dvLastError}</dt>
              <dd className="mt-1">{device.agentLastError}</dd>
            </div>
          )}
          {device.maintenanceReason && (
            <div className="sm:col-span-2">
              <dt className="text-muted">{t.dvMaintenanceLbl}</dt>
              <dd className="mt-1">
                {device.maintenanceReason}
                {device.maintenanceExpectedEnd && (
                  <>
                    {" "}
                    · {t.dvUntil} <HallTime value={device.maintenanceExpectedEnd} timeZone={tz} />
                  </>
                )}
              </dd>
            </div>
          )}
        </dl>
        {device.currentSessionId && (
          <p className="mt-3 text-sm">
            {t.dvInUseSince} <HallTime value={device.currentSessionStartedAt!} timeZone={tz} />.{" "}
            <Link
              className="underline"
              href={`/halls/${hallId}/sessions/${device.currentSessionId}`}
            >
              {t.cmViewSession}
            </Link>
          </p>
        )}
        {device.nextReservationAt && (
          <p className="mt-1 text-sm text-muted">
            {t.dvNextReservation}: <HallTime value={device.nextReservationAt} timeZone={tz} />
          </p>
        )}
      </section>

      <DeviceActions hallId={hallId} device={device} timeZone={tz} />

      <section aria-labelledby="hist-h">
        <h2 id="hist-h" className="mb-2 text-lg font-medium">
          {t.dvMaintHistory}
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">{t.dvNoMaint}</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card text-sm">
            {history.map((m) => (
              <li key={m.id} className="p-3">
                <div className="font-medium">{m.reason}</div>
                <div className="text-muted">
                  <HallTime value={m.startedAt} timeZone={tz} /> →{" "}
                  {m.endedAt ? <HallTime value={m.endedAt} timeZone={tz} /> : t.cmOngoing}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function DevicePage({ params }: PageProps<"/halls/[hallId]/devices/[deviceId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Device params={params} />
    </Suspense>
  );
}
