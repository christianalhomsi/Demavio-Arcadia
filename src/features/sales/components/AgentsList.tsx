"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { ConfirmDialog } from "@/components/domain/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { revokePlatformRoleAction } from "@/features/admin/actions";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import type { SalesAgentRow } from "../queries";

export function AgentsList({ agents }: { agents: SalesAgentRow[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [target, setTarget] = React.useState<SalesAgentRow | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  if (agents.length === 0) {
    return <EmptyState title={t.slNoAgents} description={t.slNoAgentsDesc} />;
  }
  return (
    <>
      {error && (
        <p role="alert" className="mb-2 text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
        {agents.map((a) => (
          <li
            key={a.userId}
            className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{a.displayName ?? a.email}</span>
              <span className="text-muted">
                {tpl(t.slAgentLine, {
                  email: a.email ?? "",
                  attr: a.attributionsCount,
                })}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {a.status !== "active" && <Badge tone="warning">{t.plInactive}</Badge>}
              <Button variant="ghost" size="sm" onClick={() => setTarget(a)}>
                {t.slRemoveRole}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={tpl(t.slRemoveRoleTitle, { email: target?.email ?? "" })}
        description={t.slRemoveRoleDesc}
        confirmLabel={t.slRemoveRole}
        destructive
        pending={pending}
        onConfirm={async () => {
          if (!target) return;
          setPending(true);
          const r = await revokePlatformRoleAction(target.userId, "sales_agent");
          setPending(false);
          if (r.ok) {
            setTarget(null);
            router.refresh();
          } else setError(r.message);
        }}
      />
    </>
  );
}
