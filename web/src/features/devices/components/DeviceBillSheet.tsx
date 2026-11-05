"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Money } from "@/components/domain/Money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CollectPaymentDialog } from "@/features/invoices/components/CollectPaymentDialog";
import { addSessionItemAction, removeSessionItemAction } from "@/features/products/actions";
import { endSessionAction } from "@/features/sessions/actions";
import { SessionTimer } from "@/features/sessions/components/SessionTimer";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { newIdempotencyKey } from "@/lib/idempotency";
import { formatMoney } from "@/lib/money";
import { getDeviceBillAction, type DeviceBill } from "../billActions";

export interface BillTarget {
  sessionId: string;
  deviceName: string;
  startedAt: string;
  endsAt: string | null;
}

/**
 * The running bill of one device: time, one-tap products (removable until the session ends), then
 * ending the session and collecting payment, all from this sheet. Amounts come from the database;
 * this only displays them and calls the same server actions as the sessions and invoices pages.
 */
export function DeviceBillSheet({
  hallId,
  target,
  serverNow,
  onClose,
}: {
  hallId: string;
  target: BillTarget;
  serverNow: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [bill, setBill] = React.useState<DeviceBill | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | undefined>();
  const [ended, setEnded] = React.useState(false);
  const [waiting, setWaiting] = React.useState(false);
  const [collecting, setCollecting] = React.useState(false);

  const load = React.useCallback(async () => {
    const r = await getDeviceBillAction(hallId, target.sessionId);
    if (r.ok) {
      setBill(r.data);
      setLoadError(false);
      return r.data;
    }
    setLoadError(true);
    return null;
  }, [hallId, target.sessionId]);

  React.useEffect(() => {
    let alive = true;
    getDeviceBillAction(hallId, target.sessionId).then((r) => {
      if (!alive) return;
      if (r.ok) setBill(r.data);
      else setLoadError(true);
    });
    return () => {
      alive = false;
    };
  }, [hallId, target.sessionId]);

  async function add(productId: string) {
    setBusy(`add-${productId}`);
    setError(undefined);
    const r = await addSessionItemAction(
      hallId,
      target.sessionId,
      productId,
      1,
      newIdempotencyKey(),
    );
    if (r.ok) await load();
    else setError(r.message);
    setBusy(null);
  }

  async function remove(itemId: string) {
    setBusy(`rm-${itemId}`);
    setError(undefined);
    const r = await removeSessionItemAction(hallId, target.sessionId, itemId);
    if (r.ok) await load();
    else setError(r.message);
    setBusy(null);
  }

  async function endAndPay() {
    setBusy("end");
    setError(undefined);
    const r = await endSessionAction(hallId, target.sessionId, "normal", "");
    if (!r.ok) {
      setError(r.message);
      setBusy(null);
      return;
    }
    setEnded(true);
    router.refresh();
    // The invoice is created by the database when the session ends; wait for it briefly.
    setWaiting(true);
    let latest: DeviceBill | null = null;
    for (let i = 0; i < 6; i++) {
      latest = await load();
      if (latest?.invoice) break;
      await new Promise((res) => setTimeout(res, 800));
    }
    setWaiting(false);
    setBusy(null);
    if (latest?.invoice && latest.canPay && latest.invoice.outstandingMinor > 0) {
      setCollecting(true);
    }
  }

  const invoice = bill?.invoice ?? null;
  const payable = invoice && (invoice.status === "open" || invoice.status === "partially_paid");
  const itemsTotal = bill?.items.reduce((n, i) => n + i.lineMinor, 0) ?? 0;
  const currency = bill?.items[0]?.currency ?? bill?.products[0]?.currency ?? invoice?.currency;

  return (
    <>
      <Dialog open={!collecting} onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          title={tpl(t.dbBillFor, { device: target.deviceName })}
          description={t.dbBillDesc}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-border bg-surface p-3">
              <span className="text-sm text-muted">{t.dbDuration}</span>
              {ended ? (
                <span className="text-sm">{t.ssEnded}</span>
              ) : (
                <span className="text-xl font-medium">
                  <SessionTimer
                    startedAt={target.startedAt}
                    endsAt={target.endsAt}
                    serverNow={serverNow}
                  />
                </span>
              )}
            </div>

            {loadError && (
              <p role="alert" className="text-sm text-danger">
                {t.dbLoadFail}
              </p>
            )}

            {!ended && bill?.canSell && (
              <section aria-labelledby="qa-h" className="space-y-2">
                <h3 id="qa-h" className="text-sm font-semibold text-accent">
                  {t.dbQuickAdd}
                </h3>
                {bill.products.length === 0 ? (
                  <p className="text-sm text-muted">{t.dbNoProducts}</p>
                ) : (
                  <ul className="grid grid-cols-2 gap-2">
                    {bill.products.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => add(p.id)}
                          className="flex min-h-12 w-full flex-col items-start justify-center rounded-xl border border-border bg-surface px-3 text-start transition-colors active:bg-neutral-bg disabled:opacity-50"
                        >
                          <span className="w-full truncate text-sm font-medium">{p.name}</span>
                          <span className="text-xs tabular-nums text-muted">
                            {formatMoney(p.priceMinor, p.currency)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {bill && (bill.canSell || invoice) && (
              <section aria-labelledby="bi-h" className="space-y-2">
                <h3 id="bi-h" className="text-sm font-semibold text-accent">
                  {t.pdItems}
                </h3>
                {bill.items.length === 0 ? (
                  <p className="text-sm text-muted">{t.pdNoItems}</p>
                ) : (
                  <ul className="divide-y divide-border rounded-2xl border border-border bg-surface text-sm">
                    {bill.items.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2 p-3">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{i.name}</span>
                          <span className="text-xs text-muted">
                            {tpl(t.pdLineQty, {
                              qty: i.quantity,
                              unit: formatMoney(i.unitPriceMinor, i.currency),
                            })}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="tabular-nums">
                            <Money minor={i.lineMinor} currency={i.currency} />
                          </span>
                          {!ended && bill.canSell && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="min-h-11"
                              pending={busy === `rm-${i.id}`}
                              disabled={busy !== null}
                              onClick={() => remove(i.id)}
                            >
                              {t.pdRemove}
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {bill.items.length > 0 && currency && (
                  <p className="flex justify-between text-sm">
                    <span className="text-muted">{t.dbItemsTotal}</span>
                    <strong className="tabular-nums">
                      <Money minor={itemsTotal} currency={currency} />
                    </strong>
                  </p>
                )}
              </section>
            )}

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            {waiting && (
              <p role="status" className="text-sm text-muted">
                {t.dbWaitInvoice}
              </p>
            )}
            {ended && !waiting && !invoice && (
              <p role="status" className="text-sm text-muted">
                {t.dbInvoiceLate}
              </p>
            )}
            {invoice && (
              <div className="space-y-2 rounded-2xl border border-border bg-surface p-3 text-sm">
                <p className="flex justify-between">
                  <span className="text-muted">{invoice.number}</span>
                  <strong className="tabular-nums">
                    <Money minor={invoice.totalMinor} currency={invoice.currency} />
                  </strong>
                </p>
                {payable ? (
                  <p className="flex justify-between">
                    <span className="text-muted">{t.ivOutstandingLbl}</span>
                    <strong className="tabular-nums">
                      <Money minor={invoice.outstandingMinor} currency={invoice.currency} />
                    </strong>
                  </p>
                ) : (
                  <p className="text-success">{t.dbPaid}</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-1 [&>*]:min-h-11">
              <Button asChild variant="secondary">
                <Link href={`/halls/${hallId}/sessions/${target.sessionId}`}>
                  {t.dbViewSession}
                </Link>
              </Button>
              {!ended && bill?.canEnd && (
                <Button variant="danger" pending={busy === "end"} onClick={endAndPay}>
                  {busy === "end" ? t.dbEnding : t.dbEndPay}
                </Button>
              )}
              {ended && payable && bill?.canPay && !waiting && (
                <Button onClick={() => setCollecting(true)}>{t.dbCollect}</Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {invoice && bill && (
        <CollectPaymentDialog
          hallId={hallId}
          invoice={invoice}
          methods={bill.methods}
          partialAllowed={bill.partialAllowed}
          wallets={bill.wallets}
          payer={bill.payer}
          open={collecting}
          onOpenChange={(o) => {
            setCollecting(o);
            if (!o) void load();
          }}
          onDone={() => {
            router.refresh();
            void load();
          }}
        />
      )}
    </>
  );
}
