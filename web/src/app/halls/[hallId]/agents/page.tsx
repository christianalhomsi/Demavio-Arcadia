import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { ErrorState } from "@/components/data/ErrorState";
import { HallTime } from "@/components/domain/HallTime";
import { permissionForPath } from "@/components/shell/nav";
import { TablePageSkeleton } from "@/components/ui/skeleton";
import { AgentBadge } from "@/features/devices/components/StatusBadges";
import { listDeviceStatus } from "@/features/devices/queries";
import { PairingPanel } from "@/features/pairing/components/PairingPanel";
import { listHallServers } from "@/features/pairing/queries";
import { getHallTimeZone } from "@/features/halls/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { LiveRefresh } from "@/lib/realtime/LiveRefresh";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Agents" };

async function Agents({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  const { membership } = await requireHallPermission(hallId, permissionForPath("/agents"));
  const canPair = membership.permissions.includes("hall.settings.manage");
  const { t } = await getT();
  const [devices, tz, servers] = await Promise.all([
    listDeviceStatus(hallId),
    getHallTimeZone(hallId),
    canPair ? listHallServers(hallId) : Promise.resolve([]),
  ]);
  if (!devices) return <ErrorState message={t.agLoadFail} />;

  // Offline first: these need attention.
  const rank = { offline: 0, online: 1, none: 2 } as const;
  const rows = [...devices].sort(
    (a, b) => rank[a.agentStatus] - rank[b.agentStatus] || a.name.localeCompare(b.name),
  );

  return (
    <div className="space-y-4">
      <LiveRefresh hallId={hallId} tables={["agents", "devices"]} />
      <h1 className="text-2xl font-semibold">{t.agTitle}</h1>
      {rows.length === 0 ? (
        <EmptyState title={t.dvEmptyTitle} description={t.agEmptyDesc} />
      ) : (
        <div className="stack-table overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">{t.agCaption}</caption>
            <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-2">
                  {t.colDevice}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.dvAgent}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.agVersion}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.dvLastHeartbeat}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.agSync}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.agLastError}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.deviceId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <Link
                      className="underline-offset-2 hover:underline"
                      href={`/halls/${hallId}/devices/${d.deviceId}`}
                    >
                      {d.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <AgentBadge value={d.agentStatus} />
                  </td>
                  <td className="px-4 py-2">{d.agentVersion ?? "—"}</td>
                  <td className="px-4 py-2">
                    {d.lastHeartbeatAt ? <HallTime value={d.lastHeartbeatAt} timeZone={tz} /> : "—"}
                  </td>
                  <td className="px-4 py-2 capitalize">
                    {d.agentSyncState?.replace("_", " ") ?? "—"}
                  </td>
                  <td className="px-4 py-2">{d.agentLastError ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canPair ? (
        servers ? (
          <PairingPanel
            hallId={hallId}
            timeZone={tz}
            pcs={devices
              .filter((d) => d.deviceType === "pc" && d.operationalStatus === "active")
              .map((d) => ({ id: d.deviceId, name: d.name }))}
            servers={servers}
          />
        ) : (
          <ErrorState message={t.prLoadFail} />
        )
      ) : null}
    </div>
  );
}

export default function AgentsPage({ params }: PageProps<"/halls/[hallId]/agents">) {
  return (
    <Suspense fallback={<TablePageSkeleton cols={4} />}>
      <Agents params={params} />
    </Suspense>
  );
}
