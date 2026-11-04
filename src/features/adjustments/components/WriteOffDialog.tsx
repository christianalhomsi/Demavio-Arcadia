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
import { newIdempotencyKey } from "@/lib/idempotency";
import { writeOffInvoiceAction } from "../actions";

/** Owner-only: removes an unpaid amount the customer will not pay. The database enforces every rule. */
export function WriteOffDialog({
  hallId,
  invoiceId,
  currency,
}: {
  hallId: string;
  invoiceId: string;
  currency: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | undefined>();
  // One key per intent: a retry cannot write the amount off twice.
  const keyRef = React.useRef("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setPending(true);
    setErrors({});
    setFormError(undefined);
    const r = await writeOffInvoiceAction(hallId, invoiceId, amount, reason, keyRef.current);
    setPending(false);
    if (r.ok) {
      keyRef.current = "";
      setOpen(false);
      router.refresh();
    } else if (r.fieldErrors) setErrors(r.fieldErrors);
    else setFormError(r.message);
  }

  return (
    <PermissionGate permission="payment.adjust">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t.woBtn}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t.woTitle} description={t.woDesc}>
          <form onSubmit={submit} className="space-y-3" noValidate>
            <Field
              id="wo-amount"
              label={tpl(t.woAmountCur, { cur: currency })}
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
            <Field id="wo-reason" label={t.woReason} error={errors.reason}>
              {(p) => (
                <Input
                  {...p}
                  value={reason}
                  maxLength={300}
                  onChange={(e) => setReason(e.target.value)}
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
                {t.woApply}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PermissionGate>
  );
}
