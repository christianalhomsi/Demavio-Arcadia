"use client";

import { DateField } from "@/components/ui/date-fields";
import Link from "next/link";
import { Money } from "@/components/domain/Money";
import { formatDuration } from "@/lib/dates";
import { useI18n } from "@/lib/i18n/client";
import { tpl, type Messages } from "@/lib/i18n/messages";
import type { FinancialSummary } from "../queries";
import type { ReportPeriod } from "../period";

interface Line {
  label: string;
  value: React.ReactNode;
  /** What this figure means in accounting terms (spec §13.3). */
  definition: string;
}

function Section({ title, note, lines }: { title: string; note?: string; lines: Line[] }) {
  return (
    <section className="rounded-2xl border border-border bg-surface shadow-card p-4">
      <h2 className="text-lg font-medium">{title}</h2>
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
      <dl className="mt-3 divide-y divide-border text-sm">
        {lines.map((l) => (
          <div key={l.label} className="py-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-medium">{l.label}</dt>
              <dd className="tabular-nums">{l.value}</dd>
            </div>
            <p className="mt-0.5 text-xs text-muted">{l.definition}</p>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The presets arrive with English labels from period.ts; this maps them to the dictionary. */
const PRESET_KEY: Record<string, keyof Messages> = {
  Today: "rsToday",
  Yesterday: "pYesterday",
  "Last 7 days": "pLast7",
  "This month": "pMonth",
};

/** Figures arrive from the database already categorised; this component only lays them out. */
export function ReportView({
  hallId,
  summary: s,
  period,
  presets,
}: {
  hallId: string;
  summary: FinancialSummary;
  period: ReportPeriod;
  presets: { label: string; from: string; to: string }[];
}) {
  const { t } = useI18n();
  const m = (minor: number) => <Money minor={minor} currency={s.currency} />;
  const range =
    period.from === period.to
      ? period.from
      : tpl(t.rpRangeTo, { from: period.from, to: period.to });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.rpTitle}</h1>
        <nav aria-label={t.rpPresets} className="flex flex-wrap gap-2 text-sm">
          {presets.map((p) => (
            <Link
              key={p.label}
              className="inline-flex min-h-10 items-center rounded-full border border-border px-4 py-1 hover:bg-neutral-bg"
              href={`/halls/${hallId}/reports?from=${p.from}&to=${p.to}`}
            >
              {PRESET_KEY[p.label] ? t[PRESET_KEY[p.label]!] : p.label}
            </Link>
          ))}
        </nav>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium">{t.rpFrom}</span>
          <DateField
            name="from"
            defaultValue={period.from}
            aria-label={t.rpFrom}
            className="w-44"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">{t.rpTo}</span>
          <DateField name="to" defaultValue={period.to} aria-label={t.rpTo} className="w-44" />
        </label>
        <button
          type="submit"
          className="h-11 rounded-xl border border-border bg-surface px-5 font-medium sm:h-10 hover:bg-neutral-bg"
        >
          {t.rpShow}
        </button>
      </form>
      <a
        href={`/halls/${hallId}/reports/export?from=${period.from}&to=${period.to}`}
        download
        className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-medium hover:bg-neutral-bg"
      >
        {t.rpCsv}
      </a>
      <p className="text-sm text-muted">
        {tpl(t.rpShowingA, { range, cur: s.currency })} <strong>{t.rpNot}</strong> {t.rpShowingB}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title={t.rpSecSessions}
          lines={[
            {
              label: t.rpSessionsEnded,
              value: s.sessionsEnded,
              definition: t.rpSessionsEndedDef,
            },
            {
              label: t.rpTimeUsed,
              value: formatDuration(s.billableSeconds * 1000),
              definition: t.rpTimeUsedDef,
            },
            {
              label: tpl(t.rpInvoiced, { n: s.invoicesCount }),
              value: m(s.invoicedMinor),
              definition: t.rpInvoicedDef,
            },
            {
              label: t.rpVoided,
              value: m(s.voidedMinor),
              definition: t.rpVoidedDef,
            },
          ]}
        />
        <Section
          title={t.rpSecCollections}
          note={t.rpSecCollectionsNote}
          lines={[
            {
              label: t.rpCash,
              value: m(s.collectionsCashMinor),
              definition: t.rpCashDef,
            },
            {
              label: t.rpFromWallets,
              value: m(s.collectionsWalletMinor),
              definition: t.rpFromWalletsDef,
            },
            {
              label: t.rpRefCash,
              value: m(s.refundsCashMinor),
              definition: t.rpRefCashDef,
            },
            {
              label: t.rpRefWallet,
              value: m(s.refundsWalletMinor),
              definition: t.rpRefWalletDef,
            },
          ]}
        />
        <Section
          title={t.rpSecWallets}
          lines={[
            {
              label: t.rpTopUps,
              value: m(s.walletTopUpsMinor),
              definition: t.rpTopUpsDef,
            },
            {
              label: t.rpLiability,
              value: m(s.walletLiabilityMinor),
              definition: t.rpLiabilityDef,
            },
          ]}
        />
        <Section
          title={t.rpSecReceivables}
          lines={[
            {
              label: tpl(t.rpOutstanding, { n: s.outstandingCount }),
              value: m(s.outstandingMinor),
              definition: t.rpOutstandingDef,
            },
          ]}
        />
        <Section
          title={t.rpSecDrawer}
          lines={[
            {
              label: t.slPayouts,
              value: m(s.payoutsMinor),
              definition: t.rpPayoutsDef,
            },
            {
              label: t.slAdjust,
              value: m(s.cashAdjustmentsMinor),
              definition: t.rpAdjustDef,
            },
            {
              label: tpl(t.rpShiftsClosed, { n: s.shiftsClosed }),
              value: "",
              definition: t.rpShiftsClosedDef,
            },
            {
              label: t.rpRegDiff,
              value: m(s.registerDifferenceMinor),
              definition: t.rpRegDiffDef,
            },
          ]}
        />
      </div>
    </div>
  );
}
