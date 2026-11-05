"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { PermissionGate } from "@/components/domain/PermissionGate";
import { Field } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { formatMoney } from "@/lib/money";
import { adjustInvoiceTimeAction } from "../actions";
import type { InvoiceTimeOptions } from "../queries";

type Mode = "up" | "down" | "custom";

/**
 * Owner-only. Time is counted in quarter hours; here the owner picks how this invoice counts it:
 * round up, round down, or their own price. The amounts shown come from the database.
 */
export function AdjustTimeDialog({
  hallId,
  invoiceId,
  currency,
  options,
}: {
  hallId: string;
  invoiceId: string;
  currency: string;
  options: InvoiceTimeOptions;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>(
    options.currentMinor === options.downMinor && options.downMinor !== options.upMinor
      ? "down"
      : "up",
  );
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setFormError(undefined);
    const r = await adjustInvoiceTimeAction(
      hallId,
      invoiceId,
      mode === "custom" ? { mode, amount, reason } : { mode },
    );
    setPending(false);
    if (r.ok) {
      setOpen(false);
      router.refresh();
    } else if (r.fieldErrors) setErrors(r.fieldErrors);
    else setFormError(r.message);
  }

  const choices: { mode: Mode; title: string; sub: string; price: string | null }[] = [
    {
      mode: "up",
      title: t.atUp,
      sub: tpl(t.atUpDesc, { minutes: options.upMinutes }),
      price: formatMoney(options.upMinor, currency),
    },
    {
      mode: "down",
      title: t.atDown,
      sub: tpl(t.atDownDesc, { minutes: options.downMinutes }),
      price: formatMoney(options.downMinor, currency),
    },
    { mode: "custom", title: t.atCustom, sub: t.atCustomDesc, price: null },
  ];

  return (
    <PermissionGate permission="payment.adjust">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t.atBtn}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t.atTitle} description={t.atDesc}>
          <form onSubmit={submit} className="space-y-3" noValidate>
            <p className="text-sm text-muted">
              {tpl(t.atPlayed, { minutes: Math.ceil(options.playedSeconds / 60) })}
              {" · "}
              {t.atCurrent}: {formatMoney(options.currentMinor, currency)}
            </p>
            <div role="radiogroup" aria-label={t.atTitle} className="space-y-2">
              {choices.map((c) => (
                <label
                  key={c.mode}
                  className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-border bg-surface p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                >
                  <input
                    type="radio"
                    name="time-mode"
                    className="h-5 w-5 accent-[var(--ring)]"
                    checked={mode === c.mode}
                    onChange={() => setMode(c.mode)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{c.title}</span>
                    <span className="block text-xs text-muted">{c.sub}</span>
                  </span>
                  {c.price && <span className="tabular-nums">{c.price}</span>}
                </label>
              ))}
            </div>
            {mode === "custom" && (
              <>
                <Field
                  id="at-price"
                  label={tpl(t.atPrice, { cur: currency })}
                  error={errors.amount}
                >
                  {(p) => (
                    <Input
                      {...p}
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  )}
                </Field>
                <Field id="at-reason" label={t.atReason} error={errors.reason}>
                  {(p) => (
                    <Input
                      {...p}
                      maxLength={300}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  )}
                </Field>
              </>
            )}
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
                {t.atApply}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PermissionGate>
  );
}
