"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { PermissionGate } from "@/components/domain/PermissionGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { AddItemDialog } from "@/features/products/components/AddItemDialog";
import type { PackageRow } from "@/features/packages/queries";
import type { ProductRow } from "@/features/products/queries";
import { useHallRealtime } from "@/lib/realtime/useHallRealtime";
import type { SessionRow } from "../queries";
import {
  ConvertToOpenDialog,
  EndSessionDialog,
  ExtendSessionDialog,
  WalkInDialog,
  type DeviceOption,
} from "./SessionDialogs";
import { SessionTimer } from "./SessionTimer";

type Active = { kind: "end" | "extend" | "convert" | "item"; session: SessionRow } | null;

export function SessionsBoard({
  hallId,
  sessions,
  devices,
  serverNow,
  products = [],
  packages = [],
}: {
  hallId: string;
  sessions: SessionRow[];
  devices: DeviceOption[];
  serverNow: string;
  /** Active catalog products for people allowed to sell; empty hides nothing but offers nothing. */
  products?: ProductRow[];
  /** Active packages that can be sold when starting a session. */
  packages?: PackageRow[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const live = useHallRealtime(hallId, ["sessions", "reservations"]);
  const [active, setActive] = React.useState<Active>(null);
  const done = () => router.refresh();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          {t.ssActive}
          <Badge tone="info">{sessions.length}</Badge>
        </h1>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link href={`/halls/${hallId}/sessions/history`}>{t.ssHistoryBtn}</Link>
          </Button>
          <WalkInDialog hallId={hallId} devices={devices} packages={packages} onDone={done} />
        </div>
      </div>
      {!live && (
        <p role="status" className="rounded-md bg-warning-bg p-2 text-sm text-warning">
          {t.cmLivePaused}
        </p>
      )}

      {sessions.length === 0 ? (
        <EmptyState
          title={t.ssNoActive}
          description={t.ssNoActiveDesc}
          action={
            <WalkInDialog hallId={hallId} devices={devices} packages={packages} onDone={done} />
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sessions.map((s) => (
            <li key={s.id} className="rounded-2xl border border-border bg-surface shadow-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/halls/${hallId}/sessions/${s.id}`}
                    className="font-medium hover:underline"
                  >
                    {s.deviceName}
                  </Link>
                  <div className="text-xs text-muted">{s.customerName ?? t.ssCustomer}</div>
                </div>
                <Badge tone={s.type === "open" ? "info" : "neutral"}>
                  {s.type === "open" ? t.ssOpen : t.ssFixed}
                </Badge>
              </div>
              <div className="mt-3 text-2xl">
                <SessionTimer
                  startedAt={s.startedAt}
                  endsAt={s.scheduledEndAt}
                  serverNow={serverNow}
                />
              </div>
              {s.extensionCount > 0 && (
                <p className="text-xs text-muted">{tpl(t.ssExtendedN, { n: s.extensionCount })}</p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2 [&>button]:min-h-11 sm:flex sm:flex-wrap sm:[&>button]:min-h-0">
                <PermissionGate permission="session.extend">
                  {s.type === "fixed" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setActive({ kind: "extend", session: s })}
                    >
                      {t.ssExtend}
                    </Button>
                  ) : null}
                  {s.type === "fixed" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setActive({ kind: "convert", session: s })}
                    >
                      {t.ssMakeOpen}
                    </Button>
                  ) : null}
                </PermissionGate>
                <PermissionGate permission="product.sell">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setActive({ kind: "item", session: s })}
                  >
                    {t.pdAddItem}
                  </Button>
                </PermissionGate>
                <PermissionGate permission="session.end">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setActive({ kind: "end", session: s })}
                  >
                    {t.ssEnd}
                  </Button>
                </PermissionGate>
              </div>
            </li>
          ))}
        </ul>
      )}

      {active && (
        <>
          <EndSessionDialog
            key={`end-${active.session.id}`}
            hallId={hallId}
            sessionId={active.session.id}
            deviceName={active.session.deviceName}
            open={active.kind === "end"}
            onOpenChange={(o) => !o && setActive(null)}
            onDone={done}
          />
          <AddItemDialog
            key={`item-${active.session.id}`}
            hallId={hallId}
            sessionId={active.session.id}
            deviceName={active.session.deviceName}
            products={products}
            open={active.kind === "item"}
            onOpenChange={(o) => !o && setActive(null)}
            onDone={done}
          />
          <ExtendSessionDialog
            key={`ext-${active.session.id}`}
            hallId={hallId}
            sessionId={active.session.id}
            deviceName={active.session.deviceName}
            open={active.kind === "extend"}
            onOpenChange={(o) => !o && setActive(null)}
            onDone={done}
          />
          <ConvertToOpenDialog
            key={`conv-${active.session.id}`}
            hallId={hallId}
            sessionId={active.session.id}
            deviceName={active.session.deviceName}
            open={active.kind === "convert"}
            onOpenChange={(o) => !o && setActive(null)}
            onDone={done}
          />
        </>
      )}
    </div>
  );
}
