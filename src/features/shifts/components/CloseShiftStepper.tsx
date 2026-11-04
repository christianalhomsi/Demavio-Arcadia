"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { HallTime } from "@/components/domain/HallTime";
import { Money } from "@/components/domain/Money";
import { useCan } from "@/components/domain/PermissionGate";
import { Field } from "@/components/form/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { tpl, type Messages } from "@/lib/i18n/messages";
import { newIdempotencyKey } from "@/lib/idempotency";
import { formatMoney, parseMoneyForCurrency } from "@/lib/money";
import { closeShiftAction, type CloseShiftResult } from "../actions";
import type { ShiftRow, UnpaidInvoiceRow } from "../queries";

type Step = "gate" | "count" | "review" | "done";

const STEPS: { id: Exclude<Step, "done">; label: keyof Messages }[] = [
  { id: "gate", label: "stGate" },
  { id: "count", label: "stCount" },
  { id: "review", label: "stReview" },
];

/**
 * Close flow: (1) unpaid-invoice gate, (2) count cash, (3) review and confirm. The gate, the expected
 * cash and the discrepancy all come from the database; this component only collects the count, the
 * optional override reason and the confirmation. Hiding the override is UX: the database enforces it.
 */
export function CloseShiftStepper({
  hallId,
  timeZone,
  shift,
  unpaid,
}: {
  hallId: string;
  timeZone: string;
  shift: ShiftRow;
  unpaid: UnpaidInvoiceRow[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const canOverride = useCan("payment.adjust");
  const blocking = unpaid.filter((u) => u.inShift);
  const carried = unpaid.filter((u) => !u.inShift);
  const [step, setStep] = React.useState<Step>("gate");
  const [override, setOverride] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [counted, setCounted] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [result, setResult] = React.useState<CloseShiftResult | null>(null);
  // One key per close intent; a retry after a network error reuses it.
  const keyRef = React.useRef("");

  const gateOpen = blocking.length === 0 || (override && reason.trim().length >= 3);
  const countedMinor = parseMoneyForCurrency(counted, shift.currency);

  async function confirm() {
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setPending(true);
    setError(undefined);
    const r = await closeShiftAction(
      hallId,
      shift.id,
      { countedCashText: counted, overrideReason: blocking.length > 0 ? reason : undefined },
      keyRef.current,
    );
    setPending(false);
    if (r.ok) {
      keyRef.current = "";
      setResult(r.data);
      setStep("done");
      router.refresh();
    } else setError(r.fieldErrors ? (Object.values(r.fieldErrors)[0] ?? r.message) : r.message);
  }

  if (step === "done" && result) {
    return (
      <section
        aria-labelledby="closed-h"
        className="space-y-2 rounded-2xl border border-border bg-surface shadow-card p-4"
      >
        <h2 id="closed-h" className="text-lg font-medium">
          {t.stClosed}
        </h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">{t.colExpected}</dt>
            <dd>
              <Money minor={result.expectedMinor} currency={shift.currency} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t.colCounted}</dt>
            <dd>
              <Money minor={result.countedMinor} currency={shift.currency} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t.stDifference}</dt>
            <dd>
              <Money minor={result.differenceMinor} currency={shift.currency} />{" "}
              {result.differenceMinor === 0 ? (
                <Badge tone="success">{t.shBalanced}</Badge>
              ) : (
                <Badge tone="warning">{result.differenceMinor < 0 ? t.shShort : t.shOver}</Badge>
              )}
            </dd>
          </div>
        </dl>
        {result.overridden && (
          <p className="text-sm text-muted">{tpl(t.stOverridden, { n: result.unpaidCount })}</p>
        )}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="close-h"
      className="space-y-4 rounded-2xl border border-border bg-surface shadow-card p-4"
    >
      <h2 id="close-h" className="text-lg font-medium">
        {t.stClose}
      </h2>
      <ol className="flex flex-wrap gap-2 text-sm" aria-label={t.stSteps}>
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            aria-current={s.id === step ? "step" : undefined}
            className={s.id === step ? "font-semibold" : "text-muted"}
          >
            {i + 1}. {t[s.label]}
          </li>
        ))}
      </ol>

      {step === "gate" && (
        <div className="space-y-3">
          {shift.activeSessions > 0 && (
            <p className="text-sm text-warning">{tpl(t.stRunning, { n: shift.activeSessions })}</p>
          )}
          {blocking.length === 0 ? (
            <p className="text-sm">{t.stSettled}</p>
          ) : (
            <>
              <p role="alert" className="text-sm text-danger">
                {tpl(t.stUnpaidBlock, { n: blocking.length })}
                {canOverride ? t.stOverrideOk : t.stOverrideOwner}
              </p>
              <UnpaidTable hallId={hallId} timeZone={timeZone} rows={blocking} />
              {canOverride && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={override}
                      onChange={(e) => setOverride(e.target.checked)}
                    />
                    {t.stCloseAnyway}
                  </label>
                  {override && (
                    <Field id="cs-override" label={t.stOverrideReason}>
                      {(p) => (
                        <Input
                          {...p}
                          value={reason}
                          maxLength={300}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      )}
                    </Field>
                  )}
                </div>
              )}
            </>
          )}
          {carried.length > 0 && (
            <details className="text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center text-muted">
                {tpl(t.stCarried, { n: carried.length })}
              </summary>
              <UnpaidTable hallId={hallId} timeZone={timeZone} rows={carried} />
            </details>
          )}
          <Button disabled={!gateOpen} onClick={() => setStep("count")}>
            {t.stContinue}
          </Button>
        </div>
      )}

      {step === "count" && (
        <div className="space-y-3">
          <Field
            id="cs-count"
            label={t.stCountLabel}
            hint={t.stCountHint}
            error={counted !== "" && countedMinor === null ? t.stInvalidAmount : undefined}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep("gate")}>
              {t.stBack}
            </Button>
            <Button disabled={countedMinor === null} onClick={() => setStep("review")}>
              {t.stContinue}
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-3">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">{t.stYouCounted}</dt>
              <dd className="font-medium">
                {countedMinor === null ? "—" : formatMoney(countedMinor, shift.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t.stSystemExpects}</dt>
              <dd className="font-medium">
                <Money minor={shift.expectedCashMinor} currency={shift.currency} />
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted">{t.stReviewNote}</p>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep("count")}>
              {t.stBack}
            </Button>
            <Button pending={pending} onClick={confirm}>
              {t.stConfirm}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function UnpaidTable({
  hallId,
  timeZone,
  rows,
}: {
  hallId: string;
  timeZone: string;
  rows: UnpaidInvoiceRow[];
}) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-start text-sm">
        <caption className="sr-only">{t.stUnpaidCaption}</caption>
        <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
          <tr>
            <th scope="col" className="px-3 py-2">
              {t.colInvoice}
            </th>
            <th scope="col" className="px-3 py-2">
              {t.colDevice}
            </th>
            <th scope="col" className="px-3 py-2">
              {t.colEnded}
            </th>
            <th scope="col" className="px-3 py-2">
              {t.colStatus}
            </th>
            <th scope="col" className="px-3 py-2 text-end">
              {t.colOwed}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.invoiceId} className="border-b border-border last:border-0">
              <td className="px-3 py-2">
                <Link
                  className="font-medium underline"
                  href={`/halls/${hallId}/invoices/${r.invoiceId}`}
                >
                  {r.number}
                </Link>
              </td>
              <td className="px-3 py-2">{r.deviceName}</td>
              <td className="px-3 py-2">
                {r.endedAt ? <HallTime value={r.endedAt} timeZone={timeZone} /> : "—"}
              </td>
              <td className="px-3 py-2">{r.status === "partially_paid" ? t.stPartly : t.sbOpen}</td>
              <td className="px-3 py-2 text-end tabular-nums">
                <Money minor={r.outstandingMinor} currency={r.currency} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
