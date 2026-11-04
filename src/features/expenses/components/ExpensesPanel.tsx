"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { Money } from "@/components/domain/Money";
import { Field } from "@/components/form/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-fields";
import { useI18n } from "@/lib/i18n/client";
import { tpl, type Messages } from "@/lib/i18n/messages";
import { newIdempotencyKey } from "@/lib/idempotency";
import { formatMoney, minorToInput } from "@/lib/money";
import {
  createExpenseAction,
  getReceiptUrlAction,
  updateExpenseAction,
  uploadReceiptAction,
  voidExpenseAction,
} from "../actions";
import type { ExpenseCategory, ExpenseRow, PaidWith } from "../queries";

const selectCls =
  "h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm";

const CATEGORIES: { value: ExpenseCategory; key: keyof Messages }[] = [
  { value: "rent", key: "exCatRent" },
  { value: "electricity", key: "exCatElectricity" },
  { value: "internet", key: "exCatInternet" },
  { value: "supplies", key: "exCatSupplies" },
  { value: "salaries", key: "exCatSalaries" },
  { value: "maintenance", key: "exCatMaintenance" },
  { value: "other", key: "exCatOther" },
];
const PAYMENTS: { value: PaidWith; key: keyof Messages }[] = [
  { value: "cash", key: "exPayCash" },
  { value: "bank", key: "exPayBank" },
  { value: "other", key: "exPayOther" },
];

export function ExpensesPanel({
  hallId,
  currency,
  rows,
  totalAmountMinor,
}: {
  hallId: string;
  currency: string;
  rows: ExpenseRow[];
  totalAmountMinor: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = React.useState<ExpenseRow | "new" | null>(null);
  const [voiding, setVoiding] = React.useState<ExpenseRow | null>(null);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const uploadFor = React.useRef<string>("");

  const catLabel = (c: ExpenseCategory) => t[CATEGORIES.find((x) => x.value === c)!.key] as string;
  const payLabel = (p: PaidWith) => t[PAYMENTS.find((x) => x.value === p)!.key] as string;

  async function view(id: string) {
    setMessage(null);
    const r = await getReceiptUrlAction(hallId, id);
    if (r.ok) window.open(r.data.url, "_blank", "noopener,noreferrer");
    else setMessage({ ok: false, text: r.message });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadFor.current) return;
    setMessage(null);
    const form = new FormData();
    form.set("file", file);
    const r = await uploadReceiptAction(hallId, uploadFor.current, form);
    if (r.ok) {
      setMessage({ ok: true, text: t.exUploaded });
      router.refresh();
    } else setMessage({ ok: false, text: r.fieldErrors?.file ?? r.message });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.exTitle}</h1>
        <Button onClick={() => setEditing("new")}>{t.exAdd}</Button>
      </div>
      <p className="text-sm text-muted">{t.exIntro}</p>
      <p className="text-sm font-medium">
        {tpl(t.exTotal, { amt: formatMoney(totalAmountMinor, currency) })}
      </p>
      {message && (
        <p role="status" className={message.ok ? "text-sm text-success" : "text-sm text-danger"}>
          {message.text}
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="sr-only"
        aria-label={t.exUpload}
        tabIndex={-1}
        onChange={onFile}
      />

      {rows.length === 0 ? (
        <EmptyState title={t.exEmpty} description={t.exEmptyDesc} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">{t.exCaption}</caption>
            <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 text-start">
                  {t.exDate}
                </th>
                <th scope="col" className="px-4 py-2 text-start">
                  {t.exCategory}
                </th>
                <th scope="col" className="px-4 py-2 text-end">
                  {t.colAmount}
                </th>
                <th scope="col" className="px-4 py-2 text-start">
                  {t.exPaidWith}
                </th>
                <th scope="col" className="px-4 py-2 text-start">
                  {t.exReceipt}
                </th>
                <th scope="col" className="px-4 py-2">
                  <span className="sr-only">{t.cmActions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 tabular-nums">{e.spentOn}</td>
                  <td className="px-4 py-2">
                    {catLabel(e.category)}
                    {e.description && <div className="text-xs text-muted">{e.description}</div>}
                    {e.status === "voided" && (
                      <div className="text-xs text-muted">
                        <Badge tone="neutral">{t.exVoided}</Badge> {e.voidReason}
                      </div>
                    )}
                  </td>
                  <td
                    className={`px-4 py-2 text-end tabular-nums ${e.status === "voided" ? "line-through" : ""}`}
                  >
                    <Money minor={e.amountMinor} currency={e.currency} />
                  </td>
                  <td className="px-4 py-2">{payLabel(e.paidWith)}</td>
                  <td className="px-4 py-2">
                    {e.hasReceipt ? (
                      <Button size="sm" variant="ghost" onClick={() => view(e.id)}>
                        {t.exView}
                      </Button>
                    ) : (
                      <span className="text-muted">{t.exNoReceipt}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-end">
                    {e.status === "recorded" && (
                      <span className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            uploadFor.current = e.id;
                            fileRef.current?.click();
                          }}
                        >
                          {e.hasReceipt ? t.exReplace : t.exUpload}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditing(e)}>
                          {t.emEdit}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setVoiding(e)}>
                          {t.exVoid}
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">{t.exReceiptHint}</p>

      {editing && (
        <ExpenseDialog
          key={editing === "new" ? "new" : editing.id}
          hallId={hallId}
          currency={currency}
          expense={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {voiding && (
        <VoidDialog
          hallId={hallId}
          expense={voiding}
          onClose={() => setVoiding(null)}
          onDone={() => {
            setVoiding(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ExpenseDialog({
  hallId,
  currency,
  expense,
  onClose,
  onDone,
}: {
  hallId: string;
  currency: string;
  expense: ExpenseRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [category, setCategory] = React.useState<ExpenseCategory>(expense?.category ?? "rent");
  const [amount, setAmount] = React.useState(
    expense ? minorToInput(expense.amountMinor, currency) : "",
  );
  const [spentOn, setSpentOn] = React.useState(
    expense?.spentOn ?? new Date().toISOString().slice(0, 10),
  );
  const [paidWith, setPaidWith] = React.useState<PaidWith>(expense?.paidWith ?? "cash");
  const [description, setDescription] = React.useState(expense?.description ?? "");
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
    const input = { category, amountText: amount, spentOn, paidWith, description };
    const r = expense
      ? await updateExpenseAction(hallId, expense.id, input)
      : await createExpenseAction(hallId, input, keyRef.current);
    setPending(false);
    if (r.ok) {
      keyRef.current = "";
      onDone();
    } else if (r.fieldErrors) setErrors(r.fieldErrors);
    else setFormError(r.message);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={expense ? t.exEditTitle : t.exAddTitle} description={t.exIntro}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="ex-cat" label={t.exCategory} error={errors.category}>
            {(p) => (
              <select
                {...p}
                className={selectCls}
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {t[c.key] as string}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="ex-amount"
              label={tpl(t.exAmountCur, { cur: currency })}
              error={errors.amountText ?? errors.amount}
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
            <Field id="ex-date" label={t.exDate} error={errors.spentOn ?? errors.spent_on}>
              {(p) => <DateField {...p} value={spentOn} onChange={setSpentOn} />}
            </Field>
          </div>
          <Field id="ex-paid" label={t.exPaidWith} error={errors.paidWith}>
            {(p) => (
              <select
                {...p}
                className={selectCls}
                value={paidWith}
                onChange={(e) => setPaidWith(e.target.value as PaidWith)}
              >
                {PAYMENTS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {t[c.key] as string}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="ex-desc" label={t.exDescription} error={errors.description}>
            {(p) => (
              <Input
                {...p}
                value={description}
                maxLength={300}
                onChange={(e) => setDescription(e.target.value)}
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
              {t.exSave}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VoidDialog({
  hallId,
  expense,
  onClose,
  onDone,
}: {
  hallId: string;
  expense: ExpenseRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    const r = await voidExpenseAction(hallId, expense.id, reason);
    setPending(false);
    if (r.ok) onDone();
    else setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.message);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.exVoidTitle} description={t.exVoidDesc}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="ex-void" label={t.exVoidReason} error={error}>
            {(p) => (
              <Input
                {...p}
                value={reason}
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t.cmCancel}
              </Button>
            </DialogClose>
            <Button type="submit" pending={pending}>
              {t.exVoid}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
