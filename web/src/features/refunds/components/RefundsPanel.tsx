"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { HallTime } from "@/components/domain/HallTime";
import { Money } from "@/components/domain/Money";
import { useCan } from "@/components/domain/PermissionGate";
import { Field } from "@/components/form/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { tpl, type Messages } from "@/lib/i18n/messages";
import { decideRefundAction } from "../actions";
import type { RefundRow } from "../queries";

const TONE = { pending: "warning", approved: "success", rejected: "neutral" } as const;
const REASON: Record<string, keyof Messages> = {
  customer_request: "rfrCustomer",
  overcharge: "rfrOvercharge",
  service_issue: "rfrService",
  other: "rfrOther",
};
const STATUS_KEY: Record<RefundRow["status"], keyof Messages> = {
  pending: "rfPending",
  approved: "rfApproved",
  rejected: "rfRejected",
};

export function RefundsPanel({
  hallId,
  timeZone,
  refunds,
  currentUserName,
}: {
  hallId: string;
  timeZone: string;
  refunds: RefundRow[];
  currentUserName: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const canApprove = useCan("refund.approve");
  const [deciding, setDeciding] = React.useState<{ refund: RefundRow; approve: boolean } | null>(
    null,
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t.navRefunds}</h1>
      <p className="text-sm text-muted">{t.rfIntro}</p>
      {refunds.length === 0 ? (
        <EmptyState title={t.rfNone} />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
          {refunds.map((r) => {
            const mine = currentUserName !== null && r.requestedByName === currentUserName;
            return (
              <li key={r.id} className="space-y-1 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    <Money minor={r.amountMinor} currency={r.currency} /> ·{" "}
                    <Link className="underline" href={`/halls/${hallId}/invoices/${r.invoiceId}`}>
                      {r.invoiceNumber}
                    </Link>{" "}
                    <span className="text-muted">
                      ({r.method === "cash" ? t.methodCash : t.methodWallet})
                    </span>
                  </span>
                  <Badge tone={TONE[r.status]}>{t[STATUS_KEY[r.status]]}</Badge>
                </div>
                <div className="text-muted">
                  {REASON[r.reasonCode] ? t[REASON[r.reasonCode]!] : r.reasonCode}
                  {r.note ? ` · ${r.note}` : ""} ·{" "}
                  {tpl(t.rfRequestedBy, { name: r.requestedByName ?? "—" })}{" "}
                  <HallTime value={r.requestedAt} timeZone={timeZone} />
                </div>
                {r.decidedAt && (
                  <div className="text-muted">
                    {tpl(t.rfDecidedBy, { name: r.decidedByName ?? "—" })}{" "}
                    <HallTime value={r.decidedAt} timeZone={timeZone} />
                    {r.decisionNote ? ` · ${r.decisionNote}` : ""}
                  </div>
                )}
                {r.status === "pending" && canApprove && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      disabled={mine}
                      onClick={() => setDeciding({ refund: r, approve: true })}
                    >
                      {t.rfApprove}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDeciding({ refund: r, approve: false })}
                    >
                      {t.rfReject}
                    </Button>
                    {mine && <span className="text-xs text-muted">{t.rfOwnNote}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {deciding && (
        <DecideDialog
          key={deciding.refund.id + String(deciding.approve)}
          hallId={hallId}
          refund={deciding.refund}
          approve={deciding.approve}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function DecideDialog({
  hallId,
  refund,
  approve,
  onClose,
  onDone,
}: {
  hallId: string;
  refund: RefundRow;
  approve: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(undefined);
    const r = await decideRefundAction(hallId, refund.id, approve, note);
    setPending(false);
    if (r.ok) onDone();
    else setError(r.message);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={approve ? t.rfApproveTitle : t.rfRejectTitle}
        description={approve ? t.rfApproveDesc : t.rfRejectDesc}
      >
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="dr-note" label={t.rfNoteOpt}>
            {(p) => (
              <Input
                {...p}
                value={note}
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
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
            <Button type="submit" variant={approve ? "primary" : "danger"} pending={pending}>
              {approve ? t.rfApprove : t.rfReject}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
