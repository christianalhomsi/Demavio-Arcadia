"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Field } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { newIdempotencyKey } from "@/lib/idempotency";
import { recordCashMovementAction } from "../actions";
import { MOVEMENT_KIND_KEYS, MOVEMENT_KINDS } from "../schemas";

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

/** Payout or manual adjustment in an open shift. Shown only to people who may adjust (UX only). */
export function RecordMovementButton({ hallId, shiftId }: { hallId: string; shiftId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<string>("payout");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | undefined>();
  const keyRef = React.useRef("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setPending(true);
    setErrors({});
    setFormError(undefined);
    const r = await recordCashMovementAction(
      hallId,
      shiftId,
      { kind, amountText: amount, reason },
      keyRef.current,
    );
    setPending(false);
    if (r.ok) {
      keyRef.current = "";
      setOpen(false);
      setAmount("");
      setReason("");
      router.refresh();
    } else if (r.fieldErrors) setErrors(r.fieldErrors);
    else setFormError(r.message);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t.mvRecordBtn}
      </Button>
      <DialogContent title={t.mvDialogTitle} description={t.mvDialogDesc}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="cm-kind" label={t.colType} error={errors.kind}>
            {(p) => (
              <select
                {...p}
                className={selectCls}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {MOVEMENT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {t[MOVEMENT_KIND_KEYS[k.value] ?? "mvPayout"]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="cm-amount" label={t.colAmount} error={errors.amount}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
          <Field id="cm-reason" label={t.cmReason} error={errors.reason}>
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
              {t.mvRecord}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
