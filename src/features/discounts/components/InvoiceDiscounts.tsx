"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Money } from "@/components/domain/Money";
import { PermissionGate } from "@/components/domain/PermissionGate";
import { Field } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { newIdempotencyKey } from "@/lib/idempotency";
import { formatMoney } from "@/lib/money";
import { applyDiscountAction } from "../actions";
import type { DiscountRow, InvoiceDiscountRow } from "../queries";
import { useDiscountValue } from "./DiscountsPanel";

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

/** Discounts already given on an invoice, plus the button to give one. The server works out the amount. */
export function InvoiceDiscounts({
  hallId,
  invoiceId,
  currency,
  applied,
  available,
  payable,
  isOwner,
  limitMinor,
}: {
  hallId: string;
  invoiceId: string;
  currency: string;
  applied: InvoiceDiscountRow[];
  available: DiscountRow[];
  payable: boolean;
  isOwner: boolean;
  limitMinor: number | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const valueText = useDiscountValue();
  const [open, setOpen] = React.useState(false);
  const usable = available.filter((d) => d.active);

  if (applied.length === 0 && !payable) return null;
  return (
    <section aria-labelledby="disc-h" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="disc-h" className="text-lg font-medium">
          {t.dcSection}
        </h2>
        {payable && (
          <PermissionGate permission="discount.apply">
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
              {t.dcApply}
            </Button>
          </PermissionGate>
        )}
      </div>
      {applied.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface text-sm shadow-card">
          {applied.map((d) => (
            <li key={d.id} className="space-y-1 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">
                  {d.name} · {valueText(d, currency)}
                </span>
                <span className="tabular-nums">
                  −<Money minor={d.amountMinor} currency={currency} />
                </span>
              </div>
              <div className="text-xs text-muted">
                {t.dcOriginal} {formatMoney(d.originalMinor, currency)} → {t.dcFinal}{" "}
                {formatMoney(d.finalMinor, currency)}
                {d.appliedByName ? ` · ${tpl(t.dcBy, { name: d.appliedByName })}` : ""}
              </div>
              <div className="text-xs text-muted">{d.reason}</div>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <ApplyDialog
          hallId={hallId}
          invoiceId={invoiceId}
          currency={currency}
          discounts={usable}
          isOwner={isOwner}
          limitMinor={limitMinor}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function ApplyDialog({
  hallId,
  invoiceId,
  currency,
  discounts,
  isOwner,
  limitMinor,
  onClose,
  onDone,
}: {
  hallId: string;
  invoiceId: string;
  currency: string;
  discounts: DiscountRow[];
  isOwner: boolean;
  limitMinor: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const valueText = useDiscountValue();
  const [discountId, setDiscountId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  // One key per intent: a retry after a network error cannot apply the discount twice.
  const keyRef = React.useRef("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setPending(true);
    setError(undefined);
    const r = await applyDiscountAction(
      hallId,
      invoiceId,
      { discountId: discountId || discounts[0]?.id || "", reason },
      keyRef.current,
    );
    setPending(false);
    if (r.ok) {
      keyRef.current = "";
      onDone();
    } else setError(r.fieldErrors ? (Object.values(r.fieldErrors)[0] ?? r.message) : r.message);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.dcApplyTitle} description={t.dcApplyDesc}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="ad-discount" label={t.dcChoose}>
            {(p) => (
              <select
                {...p}
                className={selectCls}
                value={discountId || discounts[0]?.id || ""}
                onChange={(e) => setDiscountId(e.target.value)}
              >
                {discounts.length === 0 && <option value="">{t.dcNone}</option>}
                {discounts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {valueText(d, currency)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="ad-reason" label={t.dcReason}>
            {(p) => (
              <Input
                {...p}
                value={reason}
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
          </Field>
          {!isOwner && (
            <p className="text-xs text-muted">
              {limitMinor == null
                ? t.dcNoLimitNote
                : tpl(t.dcLimitNote, { limit: formatMoney(limitMinor, currency) })}
            </p>
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
            <Button type="submit" pending={pending} disabled={discounts.length === 0}>
              {t.dcApplyBtn}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
