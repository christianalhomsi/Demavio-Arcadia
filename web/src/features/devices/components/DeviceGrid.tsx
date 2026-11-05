"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { PermissionGate } from "@/components/domain/PermissionGate";
import { Button } from "@/components/ui/button";
import type { PackageRow } from "@/features/packages/queries";
import { WalkInDialog } from "@/features/sessions/components/SessionDialogs";
import { useI18n } from "@/lib/i18n/client";
import { tpl, type Messages } from "@/lib/i18n/messages";
import { useHallRealtime } from "@/lib/realtime/useHallRealtime";
import type { DeviceStatus } from "../queries";
import { AgentBadge, AvailabilityBadge } from "./StatusBadges";

type Filter = "all" | "available" | "in_use" | "maintenance" | "disabled" | "offline";

const FILTERS: { value: Filter; label: keyof Messages }[] = [
  { value: "all", label: "fAll" },
  { value: "available", label: "ovAvailable" },
  { value: "in_use", label: "ovInUse" },
  { value: "maintenance", label: "ovMaintenance" },
  { value: "disabled", label: "statusDisabled" },
  { value: "offline", label: "fAgentOffline" },
];

export function matchesFilter(d: DeviceStatus, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "offline") return d.agentStatus === "offline";
  return d.effectiveAvailability === f;
}

export function DeviceGrid({
  hallId,
  devices,
  packages = [],
}: {
  hallId: string;
  devices: DeviceStatus[];
  /** Active packages offered when starting a session from a card. */
  packages?: PackageRow[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const live = useHallRealtime(hallId, ["devices", "device_maintenance", "agents"]);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");

  const shown = devices.filter(
    (d) => matchesFilter(d, filter) && d.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.dvTitle}</h1>
        <PermissionGate permission="hall.settings.manage">
          <Button asChild>
            <Link href={`/halls/${hallId}/devices/new`}>{t.dvAdd}</Link>
          </Button>
        </PermissionGate>
      </div>

      {!live && (
        <p role="status" className="rounded-md bg-warning-bg p-2 text-sm text-warning">
          {t.cmLivePaused}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label={t.dvSearch}
          placeholder={t.dvSearch}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:w-64 sm:text-sm"
        />
        <div role="group" aria-label={t.dvFilter} className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className="inline-flex min-h-10 items-center rounded-full border border-border px-4 py-1 text-sm aria-pressed:bg-neutral-bg aria-pressed:font-medium"
            >
              {t[f.label]}
              <span className="ms-2 tabular-nums text-muted">
                {devices.filter((d) => matchesFilter(d, f.value)).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {devices.length === 0 ? (
        <EmptyState title={t.dvEmptyTitle} description={t.dvEmptyDesc} />
      ) : shown.length === 0 ? (
        <EmptyState title={t.dvNoMatch} description={t.dvNoMatchDesc} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((d) => (
            <li
              key={d.deviceId}
              className="relative rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors hover:bg-neutral-bg"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/halls/${hallId}/devices/${d.deviceId}`}
                    className="font-medium after:absolute after:inset-0 after:content-['']"
                  >
                    {d.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {d.deviceType === "pc" ? t.dvPC : t.dvConsole}
                    {d.category ? ` · ${d.category}` : ""}
                  </div>
                </div>
                <AvailabilityBadge value={d.effectiveAvailability} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <AgentBadge value={d.agentStatus} />
              </div>
              {d.maintenanceReason && (
                <p className="mt-2 text-xs text-muted">
                  {tpl(t.dvMaintenanceN, { reason: d.maintenanceReason })}
                </p>
              )}
              {d.effectiveAvailability === "available" && (
                <div className="relative z-10 mt-3">
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
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
