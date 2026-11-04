"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ConfirmDialog } from "@/components/domain/ConfirmDialog";
import { Money } from "@/components/domain/Money";
import { PermissionGate } from "@/components/domain/PermissionGate";
import { FormStatus } from "@/components/form/Field";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";
import { voidInvoiceAction } from "../actions";
import type { InvoiceRow, PaymentRow } from "../queries";
import { RequestRefundDialog } from "@/features/refunds/components/RequestRefundDialog";
import { CollectPaymentDialog, type WalletOption } from "./CollectPaymentDialog";

export function InvoiceActions({
  hallId,
  invoice,
  payments,
  methods,
  partialAllowed,
  wallets,
}: {
  hallId: string;
  invoice: InvoiceRow;
  payments: PaymentRow[];
  methods: readonly ("cash" | "wallet")[];
  partialAllowed: boolean;
  wallets: WalletOption[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [collect, setCollect] = React.useState(false);
  const [voiding, setVoiding] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [refundFor, setRefundFor] = React.useState<PaymentRow | null>(null);
  const [pending, setPending] = React.useState(false);

  const payable = invoice.status === "open" || invoice.status === "partially_paid";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {payable && (
          <PermissionGate permission="payment.collect">
            <Button onClick={() => setCollect(true)}>{t.ivCollect}</Button>
          </PermissionGate>
        )}
        {invoice.status === "open" && (
          <PermissionGate permission="payment.adjust">
            <Button variant="secondary" onClick={() => setVoiding(true)}>
              {t.ivVoid}
            </Button>
          </PermissionGate>
        )}
      </div>
      <FormStatus state={msg} />

      {payments.length > 0 && (
        <section aria-labelledby="pay-h">
          <h2 id="pay-h" className="mb-2 text-lg font-medium">
            {t.ivPayments}
          </h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-3">
                <Link className="underline" href={`/halls/${hallId}/payments/${p.id}`}>
                  {p.method === "cash" ? t.methodCash : t.methodWallet}
                </Link>
                <span className="flex items-center gap-3">
                  <Money minor={p.amountMinor} currency={p.currency} />
                  <PermissionGate permission="refund.request">
                    <Button size="sm" variant="ghost" onClick={() => setRefundFor(p)}>
                      {t.ivRequestRefund}
                    </Button>
                  </PermissionGate>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CollectPaymentDialog
        key={`collect-${invoice.paidMinor}`}
        hallId={hallId}
        invoice={invoice}
        methods={methods}
        partialAllowed={partialAllowed}
        wallets={wallets}
        open={collect}
        onOpenChange={setCollect}
        onDone={() => {
          setMsg({ ok: true, message: t.ivPaymentRecorded });
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={voiding}
        onOpenChange={setVoiding}
        title={tpl(t.ivVoidTitle, { number: invoice.number })}
        description={t.ivVoidDesc}
        confirmLabel={t.ivVoid}
        destructive
        requireReason
        pending={pending}
        onConfirm={async (reason) => {
          setPending(true);
          const r = await voidInvoiceAction(hallId, invoice.id, reason ?? "");
          setPending(false);
          setMsg(r.ok ? { ok: true, message: t.ivVoided } : { ok: false, message: r.message });
          if (r.ok) {
            setVoiding(false);
            router.refresh();
          }
        }}
      />

      {refundFor && (
        <RequestRefundDialog
          key={refundFor.id}
          hallId={hallId}
          payment={refundFor}
          onClose={() => setRefundFor(null)}
          onDone={() => {
            setRefundFor(null);
            setMsg({ ok: true, message: t.ivRefundRequested });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
