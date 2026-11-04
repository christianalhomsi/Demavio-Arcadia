"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { Money } from "@/components/domain/Money";
import { PermissionGate } from "@/components/domain/PermissionGate";
import { Field } from "@/components/form/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-fields";
import { DEVICE_CATEGORIES } from "@/features/devices/schemas";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { minorToInput } from "@/lib/money";
import { isoToDate, minutesToHm } from "@/lib/timeOfDay";
import { getPackageUsesAction, upsertPackageAction } from "../actions";
import type { PackageRow, PackageUseRow } from "../queries";

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

export function PackagesPanel({
  hallId,
  currency,
  packages,
  categories,
}: {
  hallId: string;
  currency: string;
  packages: PackageRow[];
  categories: string[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = React.useState<PackageRow | "new" | null>(null);
  const [history, setHistory] = React.useState<PackageRow | null>(null);
  const [error, setError] = React.useState<string | undefined>();

  async function toggle(p: PackageRow) {
    setError(undefined);
    const r = await upsertPackageAction(hallId, p.id, {
      name: p.name,
      durationMinutes: p.durationMinutes,
      priceText: minorToInput(p.priceMinor, p.currency),
      target: targetOf(p),
      from: p.fromMinute == null ? "" : minutesToHm(p.fromMinute),
      to: p.toMinute == null ? "" : minutesToHm(p.toMinute),
      validFrom: isoToDate(p.validFrom),
      validUntil: isoToDate(p.validUntil, true),
      maxUses: p.maxUses == null ? "" : String(p.maxUses),
      active: !p.active,
    });
    if (r.ok) router.refresh();
    else setError(r.message);
  }

  const scopeText = (p: PackageRow) =>
    p.deviceName
      ? tpl(t.pkDeviceLbl, { name: p.deviceName })
      : p.category
        ? tpl(t.pkCategoryLbl, { name: p.category })
        : t.pkAnyDevice;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.pkTitle}</h1>
        <PermissionGate permission="package.manage">
          <Button onClick={() => setEditing("new")}>{t.pkAdd}</Button>
        </PermissionGate>
      </div>
      <p className="text-sm text-muted">{t.pkIntro}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {packages.length === 0 ? (
        <EmptyState title={t.pkEmpty} description={t.pkEmptyDesc} />
      ) : (
        <div className="stack-table overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">{t.pkCaption}</caption>
            <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">
                  {t.pkName}
                </th>
                <th scope="col" className="px-4 py-2 text-start">
                  {t.pkApplies}
                </th>
                <th scope="col" className="px-4 py-2 text-end">
                  {t.colPrice}
                </th>
                <th scope="col" className="px-4 py-2 text-end">
                  {t.pkUses}
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
              {packages.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">
                    {p.name}
                    <div className="text-xs font-normal text-muted">
                      {tpl(t.pkMinutes, { n: p.durationMinutes })}
                      {p.fromMinute != null && p.toMinute != null
                        ? ` · ${minutesToHm(p.fromMinute)}–${minutesToHm(p.toMinute)}`
                        : ""}
                    </div>
                  </td>
                  <td className="px-4 py-2">{scopeText(p)}</td>
                  <td className="px-4 py-2 text-end tabular-nums">
                    <Money minor={p.priceMinor} currency={p.currency} />
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">
                    {p.maxUses == null ? p.uses : tpl(t.pkUsesOf, { used: p.uses, max: p.maxUses })}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={p.active ? "success" : "neutral"}>
                      {p.active ? t.pdActive : t.pdInactive}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-end">
                    <span className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setHistory(p)}>
                        {t.pkHistory}
                      </Button>
                      <PermissionGate permission="package.manage">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                          {t.emEdit}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggle(p)}>
                          {p.active ? t.pdDeactivate : t.pdActivate}
                        </Button>
                      </PermissionGate>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PackageDialog
          key={editing === "new" ? "new" : editing.id}
          hallId={hallId}
          currency={currency}
          pkg={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {history && <HistoryDialog hallId={hallId} pkg={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function targetOf(p: PackageRow): string {
  return p.deviceId ? `device:${p.deviceId}` : p.category ? `category:${p.category}` : "";
}

function PackageDialog({
  hallId,
  currency,
  pkg,
  categories,
  onClose,
  onDone,
}: {
  hallId: string;
  currency: string;
  pkg: PackageRow | null;
  categories: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = React.useState(pkg?.name ?? "");
  const [duration, setDuration] = React.useState(String(pkg?.durationMinutes ?? 180));
  const [price, setPrice] = React.useState(pkg ? minorToInput(pkg.priceMinor, currency) : "");
  const [target, setTarget] = React.useState(pkg ? targetOf(pkg) : "");
  const [from, setFrom] = React.useState(
    pkg?.fromMinute == null ? "" : minutesToHm(pkg.fromMinute),
  );
  const [to, setTo] = React.useState(pkg?.toMinute == null ? "" : minutesToHm(pkg.toMinute));
  const [validFrom, setValidFrom] = React.useState(isoToDate(pkg?.validFrom ?? null));
  const [validUntil, setValidUntil] = React.useState(isoToDate(pkg?.validUntil ?? null, true));
  const [maxUses, setMaxUses] = React.useState(pkg?.maxUses == null ? "" : String(pkg.maxUses));
  const [active, setActive] = React.useState(pkg?.active ?? true);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setFormError(undefined);
    const r = await upsertPackageAction(hallId, pkg?.id ?? null, {
      name,
      durationMinutes: Number(duration),
      priceText: price,
      target,
      from,
      to,
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
        title={pkg ? tpl(t.pkEditTitle, { name: pkg.name }) : t.pkAddTitle}
        description={t.pkDialogDesc}
      >
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="pk-name" label={t.pkName} error={errors.name}>
            {(p) => (
              <Input {...p} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="pk-dur"
              label={t.pkDuration}
              error={errors.durationMinutes ?? errors.duration}
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={5}
                  max={720}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              )}
            </Field>
            <Field
              id="pk-price"
              label={tpl(t.pkPriceCur, { cur: currency })}
              error={errors.priceText ?? errors.price}
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              )}
            </Field>
          </div>
          <Field id="pk-target" label={t.pkApplies} error={errors.target ?? errors.package_target}>
            {(p) => (
              <select
                {...p}
                className={selectCls}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">{t.pkAnyDevice}</option>
                {[...new Set([...DEVICE_CATEGORIES, ...categories])].map((c) => (
                  <option key={c} value={`category:${c}`}>
                    {tpl(t.pkCategoryLbl, { name: c })}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="pk-from"
              label={`${t.pkTimeOfDay}: ${t.pkFrom}`}
              error={errors.from ?? errors.window_range}
            >
              {(p) => (
                <Input
                  {...p}
                  placeholder="HH:MM"
                  inputMode="numeric"
                  maxLength={5}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              )}
            </Field>
            <Field id="pk-to" label={t.pkTo}>
              {(p) => (
                <Input
                  {...p}
                  placeholder="HH:MM"
                  inputMode="numeric"
                  maxLength={5}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="pk-vf" label={t.pkValidFrom} error={errors.validFrom ?? errors.validity}>
              {(p) => <DateField {...p} clearable value={validFrom} onChange={setValidFrom} />}
            </Field>
            <Field id="pk-vu" label={t.pkValidUntil} error={errors.validUntil}>
              {(p) => <DateField {...p} clearable value={validUntil} onChange={setValidUntil} />}
            </Field>
          </div>
          <p className="text-xs text-muted">{t.pkValidityNote}</p>
          <Field
            id="pk-max"
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
              {t.pkSave}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  hallId,
  pkg,
  onClose,
}: {
  hallId: string;
  pkg: PackageRow;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = React.useState<PackageUseRow[] | null>(null);
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    let live = true;
    void getPackageUsesAction(hallId, pkg.id).then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.data);
      else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [hallId, pkg.id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={tpl(t.pkHistoryTitle, { name: pkg.name })} description={t.pkIntro}>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {rows && rows.length === 0 && <p className="text-sm text-muted">{t.pkNoUses}</p>}
        {rows && rows.length > 0 && (
          <ul className="divide-y divide-border text-sm">
            {rows.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {tpl(t.pkUsedAt, { device: u.deviceName, by: u.usedByName ?? "—" })}
                  <span className="block text-xs text-muted">
                    {new Date(u.createdAt).toLocaleString()}
                  </span>
                </span>
                <Money minor={u.priceMinor} currency={pkg.currency} />
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end pt-2">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t.cmCancel}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
