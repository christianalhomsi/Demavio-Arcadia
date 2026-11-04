"use client";

import { EmptyState } from "@/components/data/EmptyState";
import { ActionDialog } from "@/components/domain/ActionDialog";
import { HallTime } from "@/components/domain/HallTime";
import { Badge, type Tone } from "@/components/ui/badge";
import {
  approveHallRequestAction,
  rejectHallRequestAction,
  submitHallRequestAction,
} from "../actions";
import { useI18n } from "@/lib/i18n/client";
import { formatLocale, tpl } from "@/lib/i18n/messages";
import { formatMoney } from "@/lib/money";
import type { SubscriptionPlanRow } from "@/features/admin/queries";
import { planLabel } from "@/features/admin/planLabel";
import type { CreditRow, HallRequestRow } from "../queries";

/** Sales agent: asks for a hall; their manager or a super admin reviews the request. */
export function RequestHallButton({ plans = [] }: { plans?: SubscriptionPlanRow[] }) {
  const { t, locale } = useI18n();
  return (
    <ActionDialog
      trigger={t.slRequestHall}
      title={t.slRequestHall}
      description={t.slRequestHallDesc}
      fields={[
        { name: "hallName", label: t.cfgHallName, hint: t.slHintHallName, maxLength: 120 },
        {
          name: "currency",
          label: t.plCurrency,
          hint: t.slHintCurrency,
          type: "select",
          options: [
            { value: "SYP", label: t.curSyp },
            { value: "USD", label: t.curUsd },
          ],
          initial: "SYP",
        },
        {
          name: "planId",
          label: t.spField,
          hint: t.spRequestHint,
          type: "select",
          options: plans.map((p) => ({
            value: p.id,
            label:
              p.kind === "unlimited" || p.currency === null
                ? t.spUnlimited
                : `${planLabel(t, p.period, p.name)} · ${formatMoney(p.priceMinor, p.currency, formatLocale(locale))}`,
          })),
          initial: plans[0]?.id ?? "",
        },
        {
          name: "ownerEmail",
          label: t.slOwnerEmail,
          hint: t.slHintOwnerEmail,
          type: "email",
          maxLength: 254,
        },
        {
          name: "ownerUsername",
          label: t.slOwnerUsername,
          hint: t.slOwnerUsernameHint,
          maxLength: 20,
        },
        {
          name: "ownerPassword",
          label: t.slOwnerPassword,
          hint: t.slOwnerPasswordHint,
          type: "password",
          maxLength: 72,
        },
      ]}
      submitLabel={t.slSubmitReq}
      action={(v) =>
        submitHallRequestAction({
          hallName: v.hallName ?? "",
          currency: v.currency ?? "",
          ownerEmail: v.ownerEmail ?? "",
          ownerUsername: v.ownerUsername ?? "",
          ownerPassword: v.ownerPassword ?? "",
          planId: v.planId ?? "",
        })
      }
    />
  );
}

const REQUEST_TONE: Record<HallRequestRow["status"], Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "neutral",
};

/** Hall creation requests. One approval (the agent's manager or a super admin) creates the hall. */
export function HallRequestsList({
  requests,
  timeZone,
}: {
  requests: HallRequestRow[];
  timeZone: string;
}) {
  const { t, locale } = useI18n();
  if (requests.length === 0) {
    return <EmptyState title={t.slReqEmpty} description={t.slReqEmptyDesc} />;
  }
  const label = { pending: t.slReqPending, approved: t.slReqApproved, rejected: t.slReqRejected };
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
      {requests.map((r) => (
        <li key={r.id} className="space-y-2 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{r.hallName}</span>
            <Badge tone={REQUEST_TONE[r.status]}>{label[r.status]}</Badge>
          </div>
          <p className="text-muted">
            {tpl(t.slReqLine, {
              cur: r.currency,
              owner: r.ownerEmail,
              user: r.ownerUsername,
              by: r.requestedByName ?? "—",
            })}{" "}
            <HallTime value={r.createdAt} timeZone={timeZone} />
          </p>
          <p className="text-muted">
            {r.planKind === "unlimited"
              ? tpl(t.spRequested, { plan: t.spUnlimited })
              : r.planName !== null && r.planPriceMinor !== null && r.planCurrency
                ? tpl(t.spRequested, {
                    plan: `${planLabel(t, r.planPeriod, r.planName)} · ${formatMoney(r.planPriceMinor, r.planCurrency, formatLocale(locale))}`,
                  })
                : tpl(t.spRequested, { plan: t.spUnlimited })}
          </p>
          {r.managerName && (
            <p className="text-muted">{tpl(t.slReqManagerLine, { name: r.managerName })}</p>
          )}
          {r.status === "rejected" && r.rejectedReason && (
            <p className="text-muted">{r.rejectedReason}</p>
          )}
          {r.status === "pending" && !r.planAvailable && (
            <p role="alert" className="rounded-xl bg-warning-bg p-3 text-warning">
              {r.canAct ? t.spPlanGoneManager : t.spPlanGone}
            </p>
          )}
          {r.canAct && (
            <div className="flex flex-wrap gap-2 pt-1">
              {r.planAvailable && (
                <ActionDialog
                  trigger={t.slApprove}
                  triggerSize="sm"
                  title={t.slApprove}
                  description={t.slReqOnbDesc}
                  fields={[]}
                  submitLabel={t.slApprove}
                  action={(_v, key) => approveHallRequestAction(r.id, key)}
                />
              )}
              <ActionDialog
                trigger={t.slReject}
                triggerVariant="secondary"
                triggerSize="sm"
                title={t.slRejectTitle}
                description={t.slRejectDesc}
                fields={[{ name: "reason", label: t.cmReason, type: "textarea", maxLength: 300 }]}
                submitLabel={t.slReject}
                action={(v) => rejectHallRequestAction(r.id, v.reason ?? "")}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Every hall sold, and who sold it. */
export function CreditsList({ credits, timeZone }: { credits: CreditRow[]; timeZone: string }) {
  const { t } = useI18n();
  if (credits.length === 0) {
    return <EmptyState title={t.slAttrEmpty} description={t.slAttrEmptyDesc} />;
  }
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
      {credits.map((c) => (
        <li key={c.hallId} className="space-y-1 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{c.hallName}</span>
            <Badge tone="success">{t.slSold}</Badge>
          </div>
          <p className="text-muted">
            {tpl(t.slSoldBy, { name: c.soldByName ?? "—" })} ·{" "}
            <HallTime value={c.soldAt} timeZone={timeZone} />
          </p>
        </li>
      ))}
    </ul>
  );
}
