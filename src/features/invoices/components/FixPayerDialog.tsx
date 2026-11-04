"use client";

import * as React from "react";
import { Field } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { setInvoicePayerAction } from "../actions";

/** Lets staff correct who an unpaid invoice is for, so it matches the player's wallet. */
export function FixPayerDialog({
  hallId,
  invoiceId,
  open,
  onOpenChange,
  onDone,
}: {
  hallId: string;
  invoiceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [hasAccount, setHasAccount] = React.useState(false);
  const [username, setUsername] = React.useState("");
  const [guest, setGuest] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setFormError(undefined);
    const r = await setInvoicePayerAction(hallId, invoiceId, {
      username: hasAccount ? username : "",
      guestName: hasAccount ? "" : guest,
    });
    setPending(false);
    if (r.ok) {
      onOpenChange(false);
      onDone();
    } else if (r.fieldErrors) setErrors(r.fieldErrors);
    else setFormError(r.message);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t.pyFixTitle} description={t.pyFixDesc}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div role="group" className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-bg p-1 text-sm">
            {[true, false].map((acc) => (
              <button
                key={String(acc)}
                type="button"
                aria-pressed={hasAccount === acc}
                onClick={() => setHasAccount(acc)}
                className="min-h-11 rounded-lg px-2 aria-pressed:bg-surface aria-pressed:font-medium aria-pressed:shadow-card"
              >
                {acc ? t.pyHasAccount : t.pyNoAccount}
              </button>
            ))}
          </div>
          {hasAccount ? (
            <Field id="fp-user" label={t.pyUsername} error={errors.username}>
              {(p) => (
                <Input
                  {...p}
                  dir="ltr"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              )}
            </Field>
          ) : (
            <Field id="fp-guest" label={t.pyGuestName} error={errors.guestName}>
              {(p) => (
                <Input
                  {...p}
                  maxLength={80}
                  value={guest}
                  onChange={(e) => setGuest(e.target.value)}
                />
              )}
            </Field>
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
              {t.pyApply}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
