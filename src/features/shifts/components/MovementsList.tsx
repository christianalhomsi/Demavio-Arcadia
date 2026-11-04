"use client";

import { EmptyState } from "@/components/data/EmptyState";
import { HallTime } from "@/components/domain/HallTime";
import { Money } from "@/components/domain/Money";
import { useI18n } from "@/lib/i18n/client";
import { MOVEMENT_LABEL_KEYS } from "../schemas";
import type { CashMovementRow } from "../queries";

/** Signed amounts as stored by the database: positive into the drawer, negative out of it. */
export function MovementsList({
  movements,
  timeZone,
}: {
  movements: CashMovementRow[];
  timeZone: string;
}) {
  const { t } = useI18n();
  if (movements.length === 0) return <EmptyState title={t.mvNone} />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
      <table className="w-full text-start text-sm">
        <caption className="sr-only">{t.mvCaption}</caption>
        <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
          <tr>
            <th scope="col" className="px-4 py-2">
              {t.colTime}
            </th>
            <th scope="col" className="px-4 py-2">
              {t.colType}
            </th>
            <th scope="col" className="px-4 py-2">
              {t.colDetail}
            </th>
            <th scope="col" className="px-4 py-2 text-end">
              {t.colAmount}
            </th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2">
                <HallTime value={m.createdAt} timeZone={timeZone} />
              </td>
              <td className="px-4 py-2">
                {MOVEMENT_LABEL_KEYS[m.kind] ? t[MOVEMENT_LABEL_KEYS[m.kind]!] : m.kind}
              </td>
              <td className="px-4 py-2 text-muted">
                {[m.invoiceNumber, m.reason, m.actorName].filter(Boolean).join(" · ") || "—"}
              </td>
              <td className="px-4 py-2 text-end tabular-nums">
                <Money minor={m.amountMinor} currency={m.currency} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
