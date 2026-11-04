"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { PermissionGate } from "@/components/domain/PermissionGate";
import { Field } from "@/components/form/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-fields";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { formatMoney, minorToInput } from "@/lib/money";
import { isoToDate } from "@/lib/timeOfDay";
import { upsertDiscountAction } from "../actions";
import type { DiscountRow } from "../queries";
import { basisPointsToPercent } from "../schemas";

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

/** "10%" or "$5.00": how a discount reads in lists. */
export function useDiscountValue() {
  const { t } = useI18n();
  return (d: { kind: "amount" | "percent"; value: number }, currency: string) =>
    d.kind === "percent"
      ? tpl(t.dcPercentOf, { n: basisPointsToPercent(d.value) })
      : formatMoney(d.value, currency);
}

export function DiscountsPanel({
  hallId,
  currency,
  discounts,
}: {
  hallId: string;
  currency: string;
  discounts: DiscountRow[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const valueText = useDiscountValue();
  const [editing, setEditing] = React.useState<DiscountRow | "new" | null>(null);
  const [error, setError] = React.useState<string | undefined>();

  async function toggle(d: DiscountRow) {
    setError(undefined);
    const r = await upsertDiscountAction(hallId, d.id, {
      name: d.name,
      kind: d.kind,
      valueText:
        d.kind === "percent" ? basisPointsToPercent(d.value) : minorToInput(d.value, currency),
      validFrom: isoToDate(d.validFrom),
      validUntil: isoToDate(d.validUntil, true),
      maxUses: d.maxUses == null ? "" : String(d.maxUses),
      active: !d.active,
    });
    if (r.ok) router.refresh();
    else setError(r.message);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.dcTitle}</h1>
        <PermissionGate permission="discount.manage">
          <Button onClick={() => setEditing("new")}>{t.dcAdd}</Button>
        </PermissionGate>
      </div>
      <p className="text-sm text-muted">{t.dcIntro}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {discounts.length === 0 ? (
        <EmptyState title={t.dcEmpty} description={t.dcEmptyDesc} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">{t.dcCaption}</caption>
            <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">
                  {t.dcName}
                </th>
                <th scope="col" className="px-4 py-2 text-end">
                  {t.dcValue}
                </th>
                <th scope="col" className="px-4 py-2 text-end">
                  {t.dcUses}
                </th>
                <th scope="col" className="px-4 py-2 text-start">
                  {t.colStatus}
                </th>
                <th scope="col" className="px-4 py-2">
                  <span className="sr-only">{t.cmActions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">{d.name}</td>
                  <td className="px-4 py-2 text-end tabular-nums">{valueText(d, currency)}</td>
                  <td className="px-4 py-2 text-end tabular-nums">
                    {d.maxUses == null ? d.uses : tpl(t.pkUsesOf, { used: d.uses, max: d.maxUses })}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={d.active ? "success" : "neutral"}>
                      {d.active ? t.pdActive : t.pdInactive}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-end">
                    <PermissionGate permission="discount.manage">
                      <span className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>
                          {t.emEdit}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggle(d)}>
                          {d.active ? t.pdDeactivate : t.pdActivate}
                        </Button>
                      </span>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <DiscountDialog
          key={editing === "new" ? "new" : editing.id}
          hallId={hallId}
          currency={currency}
          discount={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function DiscountDialog({
  hallId,
  currency,
  discount,
  onClose,
  onDone,
}: {
  hallId: string;
  currency: string;
  discount: DiscountRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = React.useState(discount?.name ?? "");
  const [kind, setKind] = React.useState<"amount" | "percent">(discount?.kind ?? "percent");
  const [value, setValue] = React.useState(
    discount
      ? discount.kind === "percent"
        ? basisPointsToPercent(discount.value)
        : minorToInput(discount.value, currency)
      : "",
  );
  const [validFrom, setValidFrom] = React.useState(isoToDate(discount?.validFrom ?? null));
  const [validUntil, setValidUntil] = React.useState(isoToDate(discount?.validUntil ?? null, true));
  const [maxUses, setMaxUses] = React.useState(
    discount?.maxUses == null ? "" : String(discount.maxUses),
  );
  const [active, setActive] = React.useState(discount?.active ?? true);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setFormError(undefined);
    const r = await upsertDiscountAction(hallId, discount?.id ?? null, {
      name,
      kind,
      valueText: value,
      validFrom,
      validUntil,
      maxUses,
      active,
    });
    setPending(false);
    if (r.ok) onDone();
    else if (r.fieldErrors) setErrors(r.fieldErrors);
    else setFormError(r.message);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={discount ? tpl(t.dcEditTitle, { name: discount.name }) : t.dcAddTitle}
        description={t.dcIntro}
      >
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="dc-name" label={t.dcName} error={errors.name}>
            {(p) => (
              <Input {...p} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="dc-kind" label={t.dcKind} error={errors.kind}>
              {(p) => (
                <select
                  {...p}
                  className={selectCls}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                  <option value="percent">{t.dcKindPercent}</option>
                  <option value="amount">{t.dcKindAmount}</option>
                </select>
              )}
            </Field>
            <Field
              id="dc-value"
              label={
                kind === "percent" ? t.dcValuePercent : tpl(t.dcValueAmount, { cur: currency })
              }
              error={errors.valueText ?? errors.value}
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="dc-vf" label={t.pkValidFrom} error={errors.validFrom ?? errors.validity}>
              {(p) => <DateField {...p} clearable value={validFrom} onChange={setValidFrom} />}
            </Field>
            <Field id="dc-vu" label={t.pkValidUntil} error={errors.validUntil}>
              {(p) => <DateField {...p} clearable value={validUntil} onChange={setValidUntil} />}
            </Field>
          </div>
          <p className="text-xs text-muted">{t.pkValidityNote}</p>
          <Field
            id="dc-max"
            label={t.pkMaxUses}
            hint={t.pkMaxUsesHint}
            error={errors.maxUses ?? errors.max_uses}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
              />
            )}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            {t.pdActive}
          </label>
          {formError && (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t.cmCancel}
              </Button>
            </DialogClose>
            <Button type="submit" pending={pending}>
              {t.dcSave}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
