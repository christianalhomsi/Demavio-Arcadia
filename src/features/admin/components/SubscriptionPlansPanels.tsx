"use client";

import { Tags } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { ActionDialog, type DialogField } from "@/components/domain/ActionDialog";
import { ConfirmDialog } from "@/components/domain/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { formatLocale, tpl, type Messages } from "@/lib/i18n/messages";
import { pluralForm } from "@/lib/i18n/plural";
import { formatMoney, minorToInput } from "@/lib/money";
import { planLabel } from "../planLabel";
import { PLAN_PERIODS, PLAN_PERIOD_KEYS } from "../schemas";
import { saveSubscriptionPlanAction, setSubscriptionPlanStatusAction } from "../actions";
import type { SubscriptionPlanRow } from "../queries";

const fields = (t: Messages, p?: SubscriptionPlanRow): DialogField[] => [
  {
    name: "period",
    label: t.spFPeriod,
    type: "select",
    options: PLAN_PERIODS.map((x) => ({ value: x, label: t[PLAN_PERIOD_KEYS[x]] })),
    initial: p?.period ?? "monthly",
  },
  { name: "name", label: t.spFName, hint: t.spFNameHint, maxLength: 80, initial: p?.name ?? "" },
  {
    name: "currency",
    label: t.spFCurrency,
    type: "select",
    options: [
      { value: "SYP", label: t.curSyp },
      { value: "USD", label: t.curUsd },
    ],
    initial: p?.currency ?? "SYP",
  },
  {
    name: "price",
    label: t.spFPrice,
    hint: t.spFPriceHint,
    maxLength: 20,
    initial: p ? minorToInput(p.priceMinor, p.currency ?? "SYP") : "",
  },
  {
    name: "details",
    label: t.spFDetails,
    hint: t.spFDetailsHint,
    type: "textarea",
    maxLength: 1000,
    initial: p?.details ?? "",
  },
];

/** "No halls", "1 hall", "صالتان", "5 صالات", "12 صالة": the right form for the count. */
function hallsLabel(t: Messages, locale: string, n: number): string {
  const form = pluralForm(locale, n);
  const text =
    n === 0
      ? t.spHallsZero
      : form === "one"
        ? t.spHallsOne
        : form === "two"
          ? t.spHallsTwo
          : form === "few"
            ? t.spHallsFew
            : t.spHallsMany;
  return tpl(text, { n });
}

const pick = (v: Record<string, string>) => ({
  period: v.period ?? "",
  details: v.details ?? "",
  name: v.name ?? "",
  currency: v.currency ?? "",
  price: v.price ?? "",
});

export function AddPlanButton() {
  const { t } = useI18n();
  return (
    <ActionDialog
      trigger={t.spAdd}
      title={t.spAddTitle}
      description={t.spAddDesc}
      fields={fields(t)}
      submitLabel={t.spAdd}
      action={(v, key) => saveSubscriptionPlanAction("", pick(v), key)}
    />
  );
}

export function PlansList({ plans }: { plans: SubscriptionPlanRow[] }) {
  const { t } = useI18n();
  if (plans.length === 0) return <EmptyState title={t.spEmpty} description={t.spEmptyDesc} />;
  return (
    <ul className="space-y-2">
      {plans.map((p) => (
        <PlanItem key={p.id} plan={p} />
      ))}
    </ul>
  );
}

function PlanItem({ plan }: { plan: SubscriptionPlanRow }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const active = plan.status === "active";
  const fixed = plan.kind === "unlimited";

  async function setStatus(status: "active" | "inactive") {
    setPending(true);
    setError(undefined);
    const r = await setSubscriptionPlanStatusAction(plan.id, status);
    setPending(false);
    if (r.ok) {
      setOpen(false);
      router.refresh();
    } else setError(r.message);
  }

  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-sm shadow-card ${active ? "" : "opacity-70"}`}
    >
      <span
        aria-hidden
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/20 text-accent"
      >
        <Tags className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-base font-semibold">
            {fixed ? t.spUnlimited : planLabel(t, plan.period, plan.name)}
          </span>
          {fixed && <Badge tone="info">{t.spFixed}</Badge>}
          {!active && <Badge tone="warning">{t.spInactive}</Badge>}
        </div>
        <p className="mt-0.5 text-muted">
          <span className="font-medium text-foreground tabular-nums">
            {fixed || plan.currency === null
              ? t.spUnlimitedDesc
              : formatMoney(plan.priceMinor, plan.currency, formatLocale(locale))}
          </span>{" "}
          · {hallsLabel(t, locale, plan.hallsCount)}
        </p>
        {plan.details && (
          <ul className="mt-2 space-y-1 text-muted">
            {plan.details
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  {line}
                </li>
              ))}
          </ul>
        )}
        {!plan.details && !fixed && <p className="mt-2 text-xs text-muted/80">{t.spNoDetails}</p>}
        {error && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      {!fixed && (
        <div className="flex items-center gap-1">
          <ActionDialog
            trigger={t.spEdit}
            triggerVariant="ghost"
            triggerSize="sm"
            title={t.spEditTitle}
            description={t.spEditDesc}
            fields={fields(t, plan)}
            submitLabel={t.cmSave}
            action={(v, key) => saveSubscriptionPlanAction(plan.id, pick(v), key)}
          />
          {active ? (
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
              {t.spDeactivate}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" pending={pending} onClick={() => setStatus("active")}>
              {t.spActivate}
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={tpl(t.spDeactTitle, { name: plan.name })}
        description={t.spDeactDesc}
        confirmLabel={t.spDeactivate}
        destructive
        pending={pending}
        onConfirm={() => setStatus("inactive")}
      />
    </li>
  );
}
