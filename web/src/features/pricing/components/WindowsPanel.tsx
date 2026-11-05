"use client";

import { Clock, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Money } from "@/components/domain/Money";
import { Field } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DEVICE_CATEGORIES } from "@/features/devices/schemas";
import { useI18n } from "@/lib/i18n/client";
import { tpl, type Messages } from "@/lib/i18n/messages";
import { minorToInput } from "@/lib/money";
import { minutesToHm } from "@/lib/timeOfDay";
import { deleteWindowAction, upsertWindowAction } from "../windowActions";
import type { PricingWindow } from "../windowQueries";

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

const DAY_KEYS: (keyof Messages)[] = [
  "wdMon",
  "wdTue",
  "wdWed",
  "wdThu",
  "wdFri",
  "wdSat",
  "wdSun",
];

export function WindowsPanel({
  hallId,
  currency,
  windows,
  categories,
}: {
  hallId: string;
  currency: string;
  windows: PricingWindow[];
  categories: string[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = React.useState<PricingWindow | "new" | null>(null);
  const [msg, setMsg] = React.useState<{ ok: boolean; message: string } | null>(null);

  const dayLabel = (days: number[]) =>
    days.length === 7
      ? t.wnEveryDay
      : days.map((d) => t[DAY_KEYS[d - 1] as keyof typeof t] as string).join(", ");
  const targetLabel = (w: PricingWindow) =>
    w.scope === "hall"
      ? t.pcScopeHall
      : w.scope === "category"
        ? tpl(t.pcLblCategory, { name: w.category ?? "" })
        : tpl(t.pcLblDevice, { name: w.deviceName ?? "" });

  async function remove(id: string) {
    const r = await deleteWindowAction(hallId, id);
    setMsg(r.ok ? { ok: true, message: t.wnRemoved } : { ok: false, message: r.message });
    if (r.ok) router.refresh();
  }

  return (
    <section aria-labelledby="windows-h" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="windows-h" className="text-lg font-medium">
            {t.wnTitle}
          </h2>
          <p className="text-sm text-muted">{t.wnIntro}</p>
        </div>
        {windows.length > 0 && (
          <Button size="sm" className="shrink-0" onClick={() => setEditing("new")}>
            {t.wnAdd}
          </Button>
        )}
      </div>
      {msg && (
        <p role="status" className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>
          {msg.message}
        </p>
      )}
      {windows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-6 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-accent">
            <Tag className="h-6 w-6" aria-hidden />
          </span>
          <p className="font-medium">{t.wnEmpty}</p>
          <Button onClick={() => setEditing("new")}>{t.wnAdd}</Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {windows.map((w) => (
            <li
              key={w.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  <Clock className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  <span dir="ltr" className="tabular-nums">
                    {minutesToHm(w.startMinute)}–{minutesToHm(w.endMinute)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {targetLabel(w)} · {dayLabel(w.days)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-medium tabular-nums">
                  <Money minor={w.ratePerHourMinor} currency={currency} /> {t.pcPerHour}
                </span>
                <Button size="sm" variant="secondary" onClick={() => setEditing(w)}>
                  {t.emEdit}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(w.id)}>
                  {t.pcRemove}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <WindowDialog
          key={editing === "new" ? "new" : editing.id}
          hallId={hallId}
          currency={currency}
          window={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            setMsg({ ok: true, message: t.wnSaved });
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function WindowDialog({
  hallId,
  currency,
  window: w,
  categories,
  onClose,
  onDone,
}: {
  hallId: string;
  currency: string;
  window: PricingWindow | null;
  categories: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const initialTarget = !w
    ? "hall"
    : w.scope === "device"
      ? `device:${w.deviceId}`
      : w.scope === "category"
        ? `category:${w.category}`
        : "hall";
  const [target, setTarget] = React.useState(initialTarget);
  const [days, setDays] = React.useState<number[]>(w?.days ?? [1, 2, 3, 4, 5, 6, 7]);
  const [from, setFrom] = React.useState(w ? minutesToHm(w.startMinute) : "18:00");
  const [to, setTo] = React.useState(w ? minutesToHm(w.endMinute) : "24:00");
  const [rate, setRate] = React.useState(w ? minorToInput(w.ratePerHourMinor, currency) : "");
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | undefined>();

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setFormError(undefined);
    const r = await upsertWindowAction(hallId, w?.id ?? null, {
      target,
      days,
      from,
      to,
      rateText: rate,
    });
    setPending(false);
    if (r.ok) onDone();
    else if (r.fieldErrors) setErrors(r.fieldErrors);
    else setFormError(r.message);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={w ? t.wnEditTitle : t.wnAddTitle} description={t.wnIntro}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="wn-target" label={t.wnTarget} error={errors.target}>
            {(p) => (
              <select
                {...p}
                className={selectCls}
                value={target}
                disabled={!!w}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="hall">{t.pcScopeHall}</option>
                {[...new Set([...DEVICE_CATEGORIES, ...categories])].map((c) => (
                  <option key={c} value={`category:${c}`}>
                    {tpl(t.pcLblCategory, { name: c })}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">{t.wnDays}</legend>
            <div className="flex flex-wrap gap-2">
              {DAY_KEYS.map((k, i) => (
                <label
                  key={k}
                  className="flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={days.includes(i + 1)}
                    onChange={() => toggleDay(i + 1)}
                  />
                  {t[k] as string}
                </label>
              ))}
            </div>
            {errors.days && (
              <p role="alert" className="mt-1 text-sm text-danger">
                {errors.days}
              </p>
            )}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field id="wn-from" label={t.wnFrom} error={errors.from ?? errors.window_range}>
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
            <Field id="wn-to" label={t.wnTo}>
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
          <Field
            id="wn-rate"
            label={tpl(t.wnRateCur, { cur: currency })}
            error={errors.rateText ?? errors.rate}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            )}
          </Field>
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
              {t.wnSave}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
