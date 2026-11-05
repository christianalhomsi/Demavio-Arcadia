"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Money } from "@/components/domain/Money";
import { PermissionGate } from "@/components/domain/PermissionGate";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { formatMoney } from "@/lib/money";
import { removeSessionItemAction } from "../actions";
import type { SessionItemRow } from "../queries";

/** Items on a session. They can be removed only while it is running; the database enforces the lock. */
export function SessionItems({
  hallId,
  sessionId,
  items,
  live,
}: {
  hallId: string;
  sessionId: string;
  items: SessionItemRow[];
  live: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function remove(id: string) {
    setBusy(id);
    setError(undefined);
    const r = await removeSessionItemAction(hallId, sessionId, id);
    setBusy(null);
    if (r.ok) router.refresh();
    else setError(r.message);
  }

  return (
    <section aria-labelledby="items-h" className="space-y-2">
      <h2 id="items-h" className="text-lg font-medium">
        {t.pdItems}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t.pdNoItems}</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block font-medium">{i.name}</span>
                <span className="text-xs text-muted">
                  {tpl(t.pdLineQty, {
                    qty: i.quantity,
                    unit: formatMoney(i.unitPriceMinor, i.currency),
                  })}
                  {i.addedByName ? ` · ${tpl(t.pdAddedBy, { name: i.addedByName })}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">
                  <Money minor={i.lineMinor} currency={i.currency} />
                </span>
                {live && (
                  <PermissionGate permission="product.sell">
                    <Button
                      size="sm"
                      variant="ghost"
                      pending={busy === i.id}
                      onClick={() => remove(i.id)}
                    >
                      {t.pdRemove}
                    </Button>
                  </PermissionGate>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!live && items.length > 0 && <p className="text-xs text-muted">{t.pdLocked}</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
