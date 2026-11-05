"use client";

import * as React from "react";
import { Field } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { newIdempotencyKey } from "@/lib/idempotency";
import { minorToInput } from "@/lib/money";
import { requestRefundAction } from "../actions";
import { REFUND_REASONS, REFUND_REASON_KEYS } from "../schemas";

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

export function RequestRefundDialog({
  hallId,
  payment,
  onClose,
  onDone,
}: {
  hallId: string;
  payment: { id: string; method: "cash" | "wallet"; amountMinor: number; currency: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = React.useState(minorToInput(payment.amountMinor, payment.currency));
  const [reason, setReason] = React.useState<string>(REFUND_REASONS[0].value);
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const keyRef = React.useRef("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setPending(true);
    setError(undefined);
    const r = await requestRefundAction(
      hallId,
      payment.id,
      { amountText: amount, reasonCode: reason, note },
      keyRef.current,
    );
    setPending(false);
    if (r.ok) onDone();
    else setError(r.fieldErrors ? (Object.values(r.fieldErrors)[0] ?? r.message) : r.message);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t.rfTitle}
        description={tpl(t.rfDesc, {
          method: payment.method === "wallet" ? t.rfMethodWallet : t.rfMethodCash,
        })}
      >
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="rf-amount" label={t.rfAmount}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
          <Field id="rf-reason" label={t.cmReason}>
            {(p) => (
              <select
                {...p}
                className={selectCls}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {REFUND_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {t[REFUND_REASON_KEYS[r.value] ?? "rfrOther"]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="rf-note" label={reason === "other" ? t.rfNoteReq : t.rfNoteOpt}>
            {(p) => (
              <Input
                {...p}
                value={note}
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </Field>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t.cmCancel}
              </Button>
            </DialogClose>
            <Button type="submit" pending={pending}>
              {t.ivRequestRefund}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
