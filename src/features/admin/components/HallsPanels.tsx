"use client";

import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { ActionDialog } from "@/components/domain/ActionDialog";
import { ConfirmDialog } from "@/components/domain/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { formatLocale, tpl } from "@/lib/i18n/messages";
import { formatMoney } from "@/lib/money";
import { createHallWithOwnerAction, setHallStatusAction } from "../actions";
import type { SoldHallRow, SubscriptionPlanRow } from "../queries";
import { planLabel } from "../planLabel";
import { HALL_TIME_ZONE } from "../schemas";
import { DeleteHallButton } from "./DeleteButtons";

export function AddHallButton({ plans = [] }: { plans?: SubscriptionPlanRow[] }) {
  const { t, locale } = useI18n();
  return (
    <ActionDialog
      trigger={t.plAddHall}
      title={t.plAddHallTitle}
      description={t.hwAddDesc}
      fields={[
        { name: "name", label: t.cfgHallName, maxLength: 120 },
        {
          name: "currency",
          label: t.plCurrency,
          type: "select",
          options: [
            { value: "SYP", label: t.curSyp },
            { value: "USD", label: t.curUsd },
          ],
          initial: "SYP",
        },
        { name: "email", label: t.stFEmail, type: "email", maxLength: 254 },
        {
          name: "password",
          label: t.stFPassword,
          type: "password",
          hint: t.stFPasswordHint,
          maxLength: 72,
        },
        { name: "username", label: t.stFUsername, hint: t.stFUsernameHint, maxLength: 20 },
        {
          name: "planId",
          label: t.spField,
          hint: t.spFieldHint,
          type: "select",
          options: [
            ...plans.map((p) => ({
              value: p.id,
              label:
                p.kind === "unlimited" || p.currency === null
                  ? t.spUnlimited
                  : `${planLabel(t, p.period, p.name)} · ${formatMoney(p.priceMinor, p.currency, formatLocale(locale))}`,
            })),
          ],
          initial: plans[0]?.id ?? "",
        },
      ]}
      submitLabel={t.plAddHall}
      action={(v, key) =>
        createHallWithOwnerAction(
          {
            name: v.name ?? "",
            currency: v.currency ?? "",
            email: v.email ?? "",
            password: v.password ?? "",
            username: v.username ?? "",
            planId: v.planId ?? "",
          },
          key,
        )
      }
    />
  );
}

/** A date without the time, in the hall's zone (Syria), Latin digits in Arabic. */
function shortDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(formatLocale(locale === "ar" ? "ar" : "en"), {
    timeZone: HALL_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function HallsList({ halls }: { halls: SoldHallRow[] }) {
  const { t } = useI18n();
  if (halls.length === 0) return <EmptyState title={t.plTenEmpty} description={t.hwEmptyDesc} />;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      {halls.map((h) => (
        <HallItem key={h.hallId} hall={h} />
      ))}
    </ul>
  );
}

function HallItem({ hall }: { hall: SoldHallRow }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const active = hall.hallStatus === "active";
  return (
    <li className="flex items-center gap-3 p-4 text-sm">
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-accent"
      >
        <Building2 className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium">{hall.hallName}</span>
          <Badge tone="neutral">{hall.currency}</Badge>
          {!active && <Badge tone="warning">{t.plInactive}</Badge>}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {hall.ownerEmail ? tpl(t.hwOwner, { email: hall.ownerEmail }) : t.hwNoOwner}
          {hall.soldByName && ` · ${tpl(t.stSoldBy, { name: hall.soldByName })}`}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {hall.planKind === "unlimited"
            ? t.spHallUnlimited
            : hall.planName && hall.planPriceMinor !== null && hall.planCurrency
              ? tpl(t.spHallLine, {
                  name: planLabel(t, hall.planPeriod, hall.planName),
                  price: formatMoney(hall.planPriceMinor, hall.planCurrency, formatLocale(locale)),
                })
              : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{tpl(t.spStarted, { date: shortDate(hall.subscriptionStartedAt, locale) })}</span>
          <span aria-hidden>·</span>
          {hall.subscriptionEndsAt ? (
            <span className={hall.subscriptionExpired ? "text-danger" : undefined}>
              {tpl(hall.subscriptionExpired ? t.spExpiredOn : t.spEndsOn, {
                date: shortDate(hall.subscriptionEndsAt, locale),
              })}
            </span>
          ) : (
            <span>{t.spNeverEnds}</span>
          )}
          {hall.subscriptionExpired && <Badge tone="danger">{t.spExpired}</Badge>}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {active ? t.emDeactivate : t.emReactivate}
      </Button>
      <DeleteHallButton hallId={hall.hallId} name={hall.hallName} />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={tpl(active ? t.plDeactHallTitle : t.plReactHallTitle, { name: hall.hallName })}
        description={active ? t.plDeactHallDesc : t.plReactHallDesc}
        confirmLabel={active ? t.emDeactivate : t.emReactivate}
        destructive={active}
        requireReason
        pending={pending}
        onConfirm={async (reason) => {
          setPending(true);
          const r = await setHallStatusAction(
            hall.hallId,
            active ? "inactive" : "active",
            reason ?? "",
          );
          setPending(false);
          if (r.ok) {
            setOpen(false);
            router.refresh();
          } else setError(r.fieldErrors?.reason ?? r.message);
        }}
      />
    </li>
  );
}
