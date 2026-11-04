"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { Money } from "@/components/domain/Money";
import { PermissionGate } from "@/components/domain/PermissionGate";
import { Field } from "@/components/form/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { newIdempotencyKey } from "@/lib/idempotency";
import { openWalletAction, topUpWalletAction } from "../actions";
import type { WalletRow } from "../queries";

export function WalletsPanel({ hallId, wallets }: { hallId: string; wallets: WalletRow[] }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.wlTitle}</h1>
        <PermissionGate permission="wallet.top_up">
          <OpenWalletDialog
            hallId={hallId}
            onDone={(id) => router.push(`/halls/${hallId}/wallets/${id}`)}
          />
        </PermissionGate>
      </div>
      <p className="text-sm text-muted">{t.wlIntro}</p>
      {wallets.length === 0 ? (
        <EmptyState title={t.wlEmpty} description={t.wlEmptyDesc} />
      ) : (
        <div className="stack-table overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">{t.wlCaption}</caption>
            <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-2">
                  {t.colCustomer}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colStatus}
                </th>
                <th scope="col" className="px-4 py-2 text-end">
                  {t.colBalance}
                </th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => (
                <tr key={w.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <Link
                      className="font-medium hover:underline"
                      href={`/halls/${hallId}/wallets/${w.id}`}
                    >
                      {w.customerName ?? w.customerEmail}
                    </Link>
                    {w.customerName && <div className="text-xs text-muted">{w.customerEmail}</div>}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={w.status === "active" ? "success" : "warning"}>
                      {w.status === "active" ? t.wlActive : t.wlFrozen}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">
                    <Money minor={w.balanceMinor} currency={w.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OpenWalletDialog({
  hallId,
  onDone,
}: {
  hallId: string;
  onDone: (walletId: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    const r = await openWalletAction(hallId, email);
    setPending(false);
    if (r.ok) {
      setOpen(false);
      onDone(r.data.walletId);
    } else setError(r.fieldErrors ? (Object.values(r.fieldErrors)[0] ?? r.message) : r.message);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>{t.wlOpen}</Button>
      <DialogContent title={t.wlOpenTitle} description={t.wlOpenDesc}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="ow-email" label={t.wlEmail} error={error}>
            {(p) => (
              <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t.cmCancel}
              </Button>
            </DialogClose>
            <Button type="submit" pending={pending}>
              {t.wlOpen}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TopUpDialog({
  hallId,
  wallet,
  frozen,
}: {
  hallId: string;
  wallet: { id: string; currency: string };
  frozen: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const keyRef = React.useRef("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setPending(true);
    setError(undefined);
    const r = await topUpWalletAction(hallId, wallet.id, amount, keyRef.current);
    setPending(false);
    if (r.ok) {
      keyRef.current = "";
      setOpen(false);
      setAmount("");
      router.refresh();
    } else setError(r.fieldErrors ? (Object.values(r.fieldErrors)[0] ?? r.message) : r.message);
  }

  return (
    <PermissionGate permission="wallet.top_up">
      <Dialog open={open} onOpenChange={setOpen}>
        <Button onClick={() => setOpen(true)} disabled={frozen}>
          {t.wlTopUp}
        </Button>
        <DialogContent title={t.wlTopUp} description={t.wlTopUpDesc}>
          <form onSubmit={submit} className="space-y-3" noValidate>
            <Field id="tu-amount" label={tpl(t.wlAmountCur, { cur: wallet.currency })}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
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
                {t.wlAdd}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PermissionGate>
  );
}
