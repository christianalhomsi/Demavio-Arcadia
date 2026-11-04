"use client";

import * as React from "react";
import { Field } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { newIdempotencyKey } from "@/lib/idempotency";
import { formatMoney } from "@/lib/money";
import { addSessionItemAction } from "../actions";
import type { ProductRow } from "../queries";
import { MAX_QUANTITY } from "../schemas";

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

/** Adds a catalog product to a running session. Only the product and quantity are sent: never a price. */
export function AddItemDialog({
  hallId,
  sessionId,
  deviceName,
  products,
  open,
  onOpenChange,
  onDone,
}: {
  hallId: string;
  sessionId: string;
  deviceName: string;
  products: ProductRow[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const active = products.filter((p) => p.active);
  const [productId, setProductId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  // One key per add intent: a retry after a network error reuses it, so it cannot add twice.
  const keyRef = React.useRef("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setPending(true);
    setError(undefined);
    const r = await addSessionItemAction(
      hallId,
      sessionId,
      productId || active[0]?.id || "",
      Number(quantity),
      keyRef.current,
    );
    setPending(false);
    if (r.ok) {
      keyRef.current = "";
      setQuantity("1");
      onOpenChange(false);
      onDone();
    } else setError(r.fieldErrors ? (Object.values(r.fieldErrors)[0] ?? r.message) : r.message);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={tpl(t.pdAddItemTitle, { device: deviceName })}
        description={t.pdAddItemDesc}
      >
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="ai-product" label={t.pdProduct}>
            {(p) => (
              <select
                {...p}
                className={selectCls}
                value={productId || active[0]?.id || ""}
                onChange={(e) => setProductId(e.target.value)}
              >
                {active.length === 0 && <option value="">{t.pdNoActive}</option>}
                {active.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · {formatMoney(x.priceMinor, x.currency)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="ai-qty" label={t.pdQuantity}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                max={MAX_QUANTITY}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
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
            <Button type="submit" pending={pending} disabled={active.length === 0}>
              {t.pdAddBtn}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
