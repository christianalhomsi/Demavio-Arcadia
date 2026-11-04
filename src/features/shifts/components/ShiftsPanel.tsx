"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { HallTime } from "@/components/domain/HallTime";
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
import { openShiftAction } from "../actions";
import type { ShiftRow } from "../queries";

export function DifferenceBadge({ shift }: { shift: ShiftRow }) {
  const { t } = useI18n();
  if (shift.status === "open" || shift.differenceMinor === null) return null;
  if (shift.differenceMinor === 0) return <Badge tone="success">{t.shBalanced}</Badge>;
  return (
    <Badge tone="warning">
      {shift.differenceMinor < 0 ? t.shShort : t.shOver}{" "}
      <Money minor={Math.abs(shift.differenceMinor)} currency={shift.currency} />
    </Badge>
  );
}

export function ShiftsPanel({
  hallId,
  timeZone,
  shifts,
}: {
  hallId: string;
  timeZone: string;
  shifts: ShiftRow[];
}) {
  const { t } = useI18n();
  const open = shifts.find((s) => s.status === "open");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.shTitle}</h1>
        {!open && (
          <PermissionGate permission="shift.open">
            <OpenShiftDialog hallId={hallId} />
          </PermissionGate>
        )}
      </div>
      <p className="text-sm text-muted">{t.shIntro}</p>

      {open ? (
        <section
          aria-labelledby="open-shift-h"
          className="rounded-2xl border border-border bg-surface shadow-card p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="open-shift-h" className="text-lg font-medium">
              {tpl(t.shOpenTitleN, { name: open.registerName })}
            </h2>
            <Badge tone="info">{t.sbOpen}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {tpl(t.shOpenedByAt, { name: open.openedByName ?? "—" })}{" "}
            <HallTime value={open.openedAt} timeZone={timeZone} /> {t.shWith}{" "}
            <Money minor={open.openingCashMinor} currency={open.currency} />. {t.shExpectedNow}{" "}
            <strong>
              <Money minor={open.expectedCashMinor} currency={open.currency} />
            </strong>
            .
          </p>
          <div className="mt-3 rounded-xl bg-neutral-bg p-3">
            <div className="text-xs text-muted">{t.colExpected}</div>
            <div className="text-3xl font-semibold tabular-nums">
              <Money minor={open.expectedCashMinor} currency={open.currency} />
            </div>
          </div>
          <Button asChild className="mt-3 w-full sm:w-auto">
            <Link href={`/halls/${hallId}/shifts/${open.id}`}>{t.shViewClose}</Link>
          </Button>
        </section>
      ) : (
        <EmptyState title={t.shNoOpen} description={t.shNoOpenDesc} />
      )}

      {shifts.length > 0 && (
        <ul className="space-y-2 md:hidden">
          {shifts.map((s) => (
            <li key={s.id}>
              <Link
                href={`/halls/${hallId}/shifts/${s.id}`}
                className="block rounded-2xl border border-border bg-surface p-4 text-sm shadow-card transition-colors active:bg-neutral-bg"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">
                    <HallTime value={s.openedAt} timeZone={timeZone} />
                  </span>
                  <Badge tone={s.status === "open" ? "info" : "neutral"}>
                    {s.status === "open" ? t.sbOpen : t.shClosed}
                  </Badge>
                </div>
                <p className="mt-1 text-muted">{s.openedByName ?? "—"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <DifferenceBadge shift={s} />
                  {s.overrideReason && <Badge tone="warning">{t.shOverrideBadge}</Badge>}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-xs text-muted">{t.colExpected}</dt>
                    <dd className="tabular-nums">
                      <Money minor={s.expectedCashMinor} currency={s.currency} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t.colCounted}</dt>
                    <dd className="tabular-nums">
                      {s.countedCashMinor === null ? (
                        "—"
                      ) : (
                        <Money minor={s.countedCashMinor} currency={s.currency} />
                      )}
                    </dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {shifts.length > 0 && (
        <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-card md:block">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">{t.shCaption}</caption>
            <thead className="border-b border-border bg-neutral-bg text-xs uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-2">
                  {t.colOpened}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colEmployee}
                </th>
                <th scope="col" className="px-4 py-2">
                  {t.colStatus}
                </th>
                <th scope="col" className="px-4 py-2 text-end">
                  {t.colExpected}
                </th>
                <th scope="col" className="px-4 py-2 text-end">
                  {t.colCounted}
                </th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <Link
                      className="font-medium hover:underline"
                      href={`/halls/${hallId}/shifts/${s.id}`}
                    >
                      <HallTime value={s.openedAt} timeZone={timeZone} />
                    </Link>
                  </td>
                  <td className="px-4 py-2">{s.openedByName ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={s.status === "open" ? "info" : "neutral"}>
                        {s.status === "open" ? t.sbOpen : t.shClosed}
                      </Badge>
                      <DifferenceBadge shift={s} />
                      {s.overrideReason && <Badge tone="warning">{t.shOverrideBadge}</Badge>}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">
                    <Money minor={s.expectedCashMinor} currency={s.currency} />
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">
                    {s.countedCashMinor === null ? (
                      "—"
                    ) : (
                      <Money minor={s.countedCashMinor} currency={s.currency} />
                    )}
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

function OpenShiftDialog({ hallId }: { hallId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("0");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  // One key per open-shift intent: a retry after a network error reuses it.
  const keyRef = React.useRef("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyRef.current) keyRef.current = newIdempotencyKey();
    setPending(true);
    setError(undefined);
    const r = await openShiftAction(hallId, text, keyRef.current);
    setPending(false);
    if (r.ok) {
      keyRef.current = "";
      setOpen(false);
      router.push(`/halls/${hallId}/shifts/${r.data.shiftId}`);
    } else setError(r.fieldErrors ? (Object.values(r.fieldErrors)[0] ?? r.message) : r.message);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>{t.shOpen}</Button>
      <DialogContent title={t.shOpenDialogTitle} description={t.shOpenDialogDesc}>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field id="os-cash" label={t.shOpeningCash} error={error}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={text}
                onChange={(e) => setText(e.target.value)}
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
              {t.shOpen}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
