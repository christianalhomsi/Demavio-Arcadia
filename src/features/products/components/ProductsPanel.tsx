"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { Money } from "@/components/domain/Money";
import { PermissionGate, useCan } from "@/components/domain/PermissionGate";
import { Field } from "@/components/form/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { minorToInput } from "@/lib/money";
import { upsertProductAction } from "../actions";
import type { ProductRow } from "../queries";

export function ProductsPanel({
  hallId,
  currency,
  products,
}: {
  hallId: string;
  currency: string;
  products: ProductRow[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const canManage = useCan("product.manage");
  const [editing, setEditing] = React.useState<ProductRow | "new" | null>(null);
  const [error, setError] = React.useState<string | undefined>();

  async function toggle(p: ProductRow) {
    setError(undefined);
    const r = await upsertProductAction(hallId, p.id, {
      name: p.name,
      priceText: minorToInput(p.priceMinor, p.currency),
      active: !p.active,
    });
    if (r.ok) router.refresh();
    else setError(r.message);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.pdTitle}</h1>
        <PermissionGate permission="product.manage">
          <Button onClick={() => setEditing("new")}>{t.pdAdd}</Button>
        </PermissionGate>
      </div>
      <p className="text-sm text-muted">{t.pdIntro}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {products.length === 0 ? (
        <EmptyState title={t.pdEmpty} description={canManage ? t.pdEmptyDesc : t.pdEmptySeller} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">{t.pdCaption}</caption>
            <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">
                  {t.pdName}
                </th>
                <th scope="col" className="px-4 py-2 text-end">
                  {t.colPrice}
                </th>
                <th scope="col" className="px-4 py-2 text-start">
                  {t.colStatus}
                </th>
                <th scope="col" className="px-4 py-2">
                  <span className="sr-only">{t.cmActions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-end tabular-nums">
                    <Money minor={p.priceMinor} currency={p.currency} />
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={p.active ? "success" : "neutral"}>
                      {p.active ? t.pdActive : t.pdInactive}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-end">
                    <PermissionGate permission="product.manage">
                      <span className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                          {t.emEdit}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggle(p)}>
                          {p.active ? t.pdDeactivate : t.pdActivate}
                        </Button>
                      </span>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ProductDialog
          key={editing === "new" ? "new" : editing.id}
          hallId={hallId}
          currency={currency}
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ProductDialog({
  hallId,
  currency,
  product,
  onClose,
  onDone,
}: {
  hallId: string;
  currency: string;
  product: ProductRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = React.useState(product?.name ?? "");
  const [price, setPrice] = React.useState(
    product ? minorToInput(product.priceMinor, product.currency) : "",
  );
  const [active, setActive] = React.useState(product?.active ?? true);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setFormError(undefined);
    const r = await upsertProductAction(hallId, product?.id ?? null, {
      name,
      priceText: price,
      active,
    });
    setPending(false);
    if (r.ok) onDone();
    else if (r.fieldErrors) setErrors(r.fieldErrors);
    else setFormError(r.message);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={product ? tpl(t.pdEditTitle, { name: product.name }) : t.pdAddTitle}
        description={t.pdDialogDesc}
      >
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="pd-name" label={t.pdName} error={errors.name}>
            {(p) => (
              <Input {...p} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            )}
          </Field>
          <Field
            id="pd-price"
            label={tpl(t.pdPriceCur, { cur: currency })}
            error={errors.priceText ?? errors.price}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            )}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            {t.pdActive}
          </label>
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
              {t.pdSave}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
