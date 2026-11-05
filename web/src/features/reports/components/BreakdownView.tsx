"use client";

import { Money } from "@/components/domain/Money";
import { useI18n } from "@/lib/i18n/client";
import { tpl, type Messages } from "@/lib/i18n/messages";
import type { BreakdownRow } from "../queries";

/**
 * Horizontal bars for one breakdown. The bar length is only a visual aid (proportional to the largest
 * row); every figure is also written as text, so nothing depends on seeing the bar.
 */
function Bars({
  title,
  rows,
  currency,
  label,
}: {
  title: string;
  rows: BreakdownRow[];
  currency: string;
  label?: (r: BreakdownRow) => string;
}) {
  const { t } = useI18n();
  const max = Math.max(1, ...rows.map((r) => r.amountMinor));
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <h3 className="text-base font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t.rbEmpty}</p>
      ) : (
        <ul className="mt-3 space-y-3 text-sm">
          {rows.map((r) => (
            <li key={`${r.key}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium">
                  {label ? label(r) : r.label || t.rbNoCategory}
                </span>
                <span className="shrink-0 tabular-nums">
                  <Money minor={r.amountMinor} currency={currency} />
                  <span className="ms-2 text-xs text-muted">
                    {tpl(t.rbCount, { n: r.itemCount })}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-bg" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(2, Math.round((r.amountMinor / max) * 100))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const EXPENSE_KEYS: Record<string, keyof Messages> = {
  rent: "exCatRent",
  electricity: "exCatElectricity",
  internet: "exCatInternet",
  supplies: "exCatSupplies",
  salaries: "exCatSalaries",
  maintenance: "exCatMaintenance",
  other: "exCatOther",
};

export function BreakdownView({ rows, currency }: { rows: BreakdownRow[]; currency: string }) {
  const { t } = useI18n();
  const by = (d: string) =>
    rows.filter((r) => r.dimension === d).sort((a, b) => b.amountMinor - a.amountMinor);
  const days = rows.filter((r) => r.dimension === "day").sort((a, b) => a.key.localeCompare(b.key));
  const total = (k: string) =>
    rows.find((r) => r.dimension === "total" && r.key === k)?.amountMinor ?? 0;

  return (
    <section aria-labelledby="rb-h" className="space-y-4">
      <div>
        <h2 id="rb-h" className="text-lg font-medium">
          {t.rbTitle}
        </h2>
        <p className="text-sm text-muted">{t.rbIntro}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Bars title={t.rbByDay} rows={days} currency={currency} />
        <Bars title={t.rbByDevice} rows={by("device")} currency={currency} />
        <Bars title={t.rbByCategory} rows={by("device_category")} currency={currency} />
        <Bars title={t.rbByEmployee} rows={by("employee")} currency={currency} />
        <Bars title={t.rbByProduct} rows={by("product")} currency={currency} />
        <Bars title={t.rbDiscountEmployee} rows={by("discount_employee")} currency={currency} />
        <Bars
          title={t.rbExpenseCategory}
          rows={by("expense_category")}
          currency={currency}
          label={(r) => (EXPENSE_KEYS[r.key] ? (t[EXPENSE_KEYS[r.key]!] as string) : r.label)}
        />
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-base font-medium">{t.rbTotals}</h3>
          <dl className="mt-3 divide-y divide-border text-sm">
            {(
              [
                [t.rbExpensesTotal, total("expenses")],
                [t.rbDiscountsTotal, total("discounts")],
                [t.rbWriteOffsTotal, total("write_offs")],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-2">
                <dt className="font-medium">{label}</dt>
                <dd className="tabular-nums">
                  <Money minor={value} currency={currency} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </section>
  );
}
