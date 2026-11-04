"use client";

import * as React from "react";
import { Field } from "@/components/form/Field";
import { Money } from "@/components/domain/Money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { newIdempotencyKey } from "@/lib/idempotency";
import { collectPaymentAction } from "../actions";

export interface WalletOption {
  id: string;
  label: string;
  balanceMinor: number;
  currency: string;
  frozen: boolean;
}

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

export function CollectPaymentDialog({
  hallId,
  invoice,
  methods,
  partialAllowed,
  wallets,
  open,
  onOpenChange,
  onDone,
}: {
  hallId: string;
  invoice: { id: string; number: string; currency: string; outstandingMinor: number };
  methods: readonly ("cash" | "wallet")[];
  partialAllowed: boolean;
  wallets: WalletOption[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [method, setMethod] = React.useState<"cash" | "wallet">(methods[0] ?? "cash");
  const [walletId, setWalletId] = React.useState("");
  const [custom, setCustom] = React.useState(false);
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  // One key per payment intent: a retry after a network error reuses it, so it can't charge twice.
  const keyRef = React.useRef("");

  const usable = wallets.filter((w) => w.currency === invoice.currency && !w.frozen);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setPending(true);
    setError(undefined);
    const r = await collectPaymentAction(
      hallId,
      invoice.id,
      {
        method,
        walletId: method === "wallet" ? walletId || usable[0]?.id || null : null,
        amount: custom ? { kind: "custom", text } : { kind: "full" },
      },
      keyRef.current,
    );
    setPending(false);
    if (r.ok) {
      keyRef.current = "";
      onOpenChange(false);
      onDone();
    } else setError(r.fieldErrors ? (Object.values(r.fieldErrors)[0] ?? r.message) : r.message);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={tpl(t.ivCollectTitle, { number: invoice.number })}
        description={t.ivCollectDesc}
      >
        <form onSubmit={submit} className="space-y-3" noValidate>
          <p className="text-sm">
            {t.ivOutstandingLbl}{" "}
            <strong>
              <Money minor={invoice.outstandingMinor} currency={invoice.currency} />
            </strong>
          </p>
          <Field id="pay-method" label={t.ivMethod}>
            {(p) => (
              <select
                {...p}
                className={selectCls}
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
              >
                {methods.map((m) => (
                  <option key={m} value={m}>
                    {m === "cash" ? t.methodCash : t.methodWallet}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {method === "wallet" && (
            <Field id="pay-wallet" label={t.ivWalletLbl} hint={t.ivWalletHint}>
              {(p) => (
                <select
                  {...p}
                  className={selectCls}
                  value={walletId || usable[0]?.id || ""}
                  onChange={(e) => setWalletId(e.target.value)}
                >
                  {usable.length === 0 && <option value="">{t.ivNoWallet}</option>}
                  {usable.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          {partialAllowed && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={custom}
                onChange={(e) => setCustom(e.target.checked)}
              />
              {t.ivPartial}
            </label>
          )}
          {custom && (
            <Field id="pay-amount" label={t.ivAmount}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              )}
            </Field>
          )}
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
            <Button
              type="submit"
              pending={pending}
              disabled={method === "wallet" && usable.length === 0}
            >
              {custom ? t.ivRecord : t.ivCollectFull}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
