"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Field } from "@/components/form/Field";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions/result";
import { useI18n } from "@/lib/i18n/client";
import { newIdempotencyKey } from "@/lib/idempotency";

export interface DialogField {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "textarea" | "select";
  options?: { value: string; label: string }[];
  hint?: string;
  maxLength?: number;
  initial?: string;
}

const controlCls =
  "w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:text-sm aria-[invalid=true]:border-danger";

/**
 * A button that opens a small form and submits it to a Server Action. One idempotency key is created
 * per open dialog and reused for retries. The action's own permission checks and the database decide
 * whether it is allowed; this only collects input.
 */
export function ActionDialog<T = unknown>({
  trigger,
  triggerVariant = "primary",
  triggerSize = "md",
  title,
  description,
  fields,
  submitLabel,
  action,
  success,
  disabled,
}: {
  trigger: string;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  title: string;
  description?: string;
  fields: DialogField[];
  submitLabel: string;
  action: (values: Record<string, string>, idempotencyKey: string) => Promise<ActionResult<T>>;
  /** Shown instead of the form after success (e.g. a one-time invitation link). */
  success?: (data: T) => React.ReactNode;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const initial = () => Object.fromEntries(fields.map((f) => [f.name, f.initial ?? ""]));
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, string>>(initial);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | undefined>();
  const [done, setDone] = React.useState<React.ReactNode>(null);
  const keyRef = React.useRef("");

  function onOpenChange(o: boolean) {
    setOpen(o);
    if (!o) {
      setValues(initial());
      setErrors({});
      setFormError(undefined);
      setDone(null);
      keyRef.current = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setPending(true);
    setErrors({});
    setFormError(undefined);
    const r = await action(values, keyRef.current);
    setPending(false);
    if (r.ok) {
      keyRef.current = "";
      router.refresh();
      if (success) setDone(success(r.data));
      else onOpenChange(false);
    } else if (r.fieldErrors) setErrors(r.fieldErrors);
    else setFormError(r.message);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {trigger}
      </Button>
      <DialogContent title={title} description={description}>
        {done ? (
          <div className="space-y-3">
            {done}
            <div className="flex justify-end">
              <DialogClose asChild>
                <Button>{t.emDone}</Button>
              </DialogClose>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3" noValidate>
            {fields.map((f) => (
              <Field
                key={f.name}
                id={`ad-${f.name}`}
                label={f.label}
                hint={f.hint}
                hintAbove
                error={errors[f.name]}
              >
                {(p) =>
                  f.type === "select" ? (
                    <select
                      {...p}
                      className={`h-11 sm:h-10 ${controlCls}`}
                      value={values[f.name]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    >
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      {...p}
                      rows={3}
                      maxLength={f.maxLength}
                      className={`py-2.5 ${controlCls}`}
                      value={values[f.name]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      {...p}
                      type={f.type === "email" || f.type === "password" ? f.type : "text"}
                      autoComplete={f.type === "password" ? "new-password" : undefined}
                      maxLength={f.maxLength}
                      value={values[f.name]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    />
                  )
                }
              </Field>
            ))}
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
                {submitLabel}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One-time link display used after creating an invitation. */
export function InviteLink({ token, note }: { token: string; note?: string }) {
  const { t } = useI18n();
  const link =
    typeof window === "undefined"
      ? `/invite/${token}`
      : `${window.location.origin}/invite/${token}`;
  return (
    <div className="space-y-3">
      <p className="text-sm">{note ?? t.emLinkNote}</p>
      <Input
        readOnly
        aria-label={t.emLinkLabel}
        value={link}
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(link)}>
        {t.emCopy}
      </Button>
    </div>
  );
}
