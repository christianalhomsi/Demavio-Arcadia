"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { PermissionGate } from "@/components/domain/PermissionGate";
import type { PackageRow } from "@/features/packages/queries";
import { WalkInDialog } from "@/features/sessions/components/SessionDialogs";
import { SessionTimer } from "@/features/sessions/components/SessionTimer";
import { useI18n } from "@/lib/i18n/client";
import { useHallRealtime } from "@/lib/realtime/useHallRealtime";
import type { DeviceStatus } from "../queries";
import { DeviceBillSheet, type BillTarget } from "./DeviceBillSheet";
import { AvailabilityBadge } from "./StatusBadges";

/**
 * The hall's front page: every device with its state. A running device opens its bill with one tap
 * (a double-click has no equivalent on a phone); an available one has a start-session button.
 */
export function DeviceBoard({
  hallId,
  devices,
  packages,
  serverNow,
}: {
  hallId: string;
  devices: DeviceStatus[];
  packages: PackageRow[];
  serverNow: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const live = useHallRealtime(hallId, ["devices", "device_maintenance", "sessions", "agents"]);
  const [bill, setBill] = React.useState<BillTarget | null>(null);

  if (devices.length === 0) {
    return <EmptyState title={t.dvEmptyTitle} description={t.dvEmptyDesc} />;
  }

  return (
    <section aria-labelledby="board-h" className="space-y-3">
      <h2 id="board-h" className="sr-only">
        {t.dvTitle}
      </h2>
      {!live && (
        <p role="status" className="rounded-md bg-warning-bg p-2 text-sm text-warning">
          {t.cmLivePaused}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {devices.map((d) => {
          const running = d.effectiveAvailability === "in_use" && d.currentSessionId !== null;
          const body = (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-start">
                  <div className="truncate font-medium">{d.name}</div>
                  <div className="text-xs text-muted">
                    {d.deviceType === "pc" ? t.dvPC : t.dvConsole}
                    {d.category ? ` · ${d.category}` : ""}
                  </div>
                </div>
                <AvailabilityBadge value={d.effectiveAvailability} />
              </div>
              {running && d.currentSessionStartedAt && (
                <div className="mt-3 text-start text-2xl">
                  <SessionTimer
                    startedAt={d.currentSessionStartedAt}
                    endsAt={d.currentSessionEndsAt}
                    serverNow={serverNow}
                  />
                </div>
              )}
            </>
          );
          return (
            <li
              key={d.deviceId}
              className="rounded-2xl border border-border bg-surface p-4 shadow-card"
            >
              {running ? (
                <button
                  type="button"
                  aria-label={`${d.name} · ${t.dbOpenBill}`}
                  className="block w-full rounded-xl text-start transition-colors active:bg-neutral-bg"
                  onClick={() =>
                    d.currentSessionId &&
                    d.currentSessionStartedAt &&
                    setBill({
                      sessionId: d.currentSessionId,
                      deviceName: d.name,
                      startedAt: d.currentSessionStartedAt,
                      endsAt: d.currentSessionEndsAt,
                    })
                  }
                >
                  {body}
                </button>
              ) : (
                body
              )}
              {d.effectiveAvailability === "available" && (
                <PermissionGate permission="session.start">
                  <div className="mt-3">
                    <WalkInDialog
                      hallId={hallId}
                      devices={[{ id: d.deviceId, name: d.name, available: true }]}
                      packages={packages}
                      initialDeviceId={d.deviceId}
                      triggerLabel={t.dvStartSession}
                      triggerSize="md"
                      triggerClassName="w-full"
                      onDone={() => router.refresh()}
                    />
                  </div>
                </PermissionGate>
              )}
            </li>
          );
        })}
      </ul>

      {bill && (
        <DeviceBillSheet
          key={bill.sessionId}
          hallId={hallId}
          target={bill}
          serverNow={serverNow}
          onClose={() => {
            setBill(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
