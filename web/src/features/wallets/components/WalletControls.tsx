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
import { formatMoney } from "@/lib/money";
import { setWalletStatusAction, withdrawFromWalletAction } from "../actions";

/** Owner-only wallet controls: freeze/unfreeze and cash withdrawal. */
export function WalletControls({
  hallId,
  walletId,
  currency,
  balanceMinor,
  frozen,
}: {
  hallId: string;
  walletId: string;
  currency: string;
  balanceMinor: number;
  frozen: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = React.useState<"status" | "withdraw" | null>(null);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | undefined>();
  const keyRef = React.useRef("");

  function close() {
    setMode(null);
    setAmount("");
    setReason("");
    setErrors({});
    setFormError(undefined);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setPending(true);
    setErrors({});
    setFormError(undefined);
    const r =
      mode === "withdraw"
        ? await withdrawFromWalletAction(hallId, walletId, amount, reason, keyRef.current)
        : await setWalletStatusAction(hallId, walletId, !frozen, reason);
    setPending(false);
    if (r.ok) {
      keyRef.current = "";
      close();
      router.refresh();
    } else if (r.fieldErrors) setErrors(r.fieldErrors);
    else setFormError(r.message);
  }

  return (
    <PermissionGate permission="wallet.withdraw">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setMode("status")}>
          {frozen ? t.wcUnfreeze : t.wcFreeze}
        </Button>
        <Button
          variant="secondary"
          disabled={frozen || balanceMinor <= 0}
          onClick={() => setMode("withdraw")}
        >
          {t.wcWithdraw}
        </Button>
      </div>
      <Dialog open={mode !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent
          title={mode === "withdraw" ? t.wcWithdrawTitle : frozen ? t.wcUnfreeze : t.wcFreeze}
          description={
            mode === "withdraw" ? t.wcWithdrawDesc : frozen ? t.wcUnfreezeDesc : t.wcFreezeDesc
          }
        >
          <form onSubmit={submit} className="space-y-3" noValidate>
            {mode === "withdraw" && (
              <Field
                id="wc-amount"
                label={tpl(t.wcAmountCur, { cur: currency })}
                hint={tpl(t.wcAvailable, { amt: formatMoney(balanceMinor, currency) })}
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
            )}
            <Field id="wc-reason" label={t.wcReason} error={errors.reason}>
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
                {t.wcConfirm}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PermissionGate>
  );
}
