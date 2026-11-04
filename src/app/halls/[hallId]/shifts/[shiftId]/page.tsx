import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HallTime } from "@/components/domain/HallTime";
import { Money } from "@/components/domain/Money";
import { PermissionGate } from "@/components/domain/PermissionGate";
import { permissionForPath } from "@/components/shell/nav";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getHallTimeZone } from "@/features/halls/queries";
import { CloseShiftStepper } from "@/features/shifts/components/CloseShiftStepper";
import { MovementsList } from "@/features/shifts/components/MovementsList";
import { RecordMovementButton } from "@/features/shifts/components/RecordMovementDialog";
import { DifferenceBadge } from "@/features/shifts/components/ShiftsPanel";
import { getShift, getShiftUnpaidSummary, listCashMovements } from "@/features/shifts/queries";
import { isUuid } from "@/lib/auth/authorize";
import { requireHallPermission } from "@/lib/auth/guards";
import { LiveRefresh } from "@/lib/realtime/LiveRefresh";
import { getT } from "@/lib/i18n/server";
import { tpl, type Messages } from "@/lib/i18n/messages";

export const metadata = { title: "Shift" };

async function ShiftDetail({ params }: { params: Promise<{ hallId: string; shiftId: string }> }) {
  const { hallId, shiftId } = await params;
  const { membership } = await requireHallPermission(hallId, permissionForPath("/shifts"));
  if (!isUuid(shiftId)) notFound();

  const [shift, tz, movements] = await Promise.all([
    getShift(hallId, shiftId),
    getHallTimeZone(hallId),
    listCashMovements(hallId, { shiftId, limit: 100, offset: 0 }),
  ]);
  if (!shift) notFound();
  const { t } = await getT();

  const canClose = shift.status === "open" && membership.permissions.includes("shift.close");
  const unpaid = canClose ? await getShiftUnpaidSummary(shiftId) : null;
  const c = shift.currency;

  const lines: [keyof Messages, number][] = [
    ["slOpening", shift.openingCashMinor],
    ["slCashPayments", shift.cashPaymentsMinor],
    ["slTopUps", shift.topUpsMinor],
    ["slRefunds", shift.cashRefundsMinor],
    ["slPayouts", shift.payoutsMinor],
    ["slAdjust", shift.adjustmentsMinor],
  ];

  return (
    <div className="space-y-6">
      <LiveRefresh hallId={hallId} tables={["shifts"]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">
          {tpl(t.shDetailTitle, { name: shift.registerName })}
        </h1>
        <span className="flex items-center gap-2">
          <Badge tone={shift.status === "open" ? "info" : "neutral"}>
            {shift.status === "open" ? t.sbOpen : t.shClosed}
          </Badge>
          <DifferenceBadge shift={shift} />
        </span>
      </div>
      <p className="text-sm text-muted">
        {tpl(t.shOpenedByAt, { name: shift.openedByName ?? "—" })}{" "}
        <HallTime value={shift.openedAt} timeZone={tz} />
        {shift.closedAt && (
          <>
            {" "}
            · {tpl(t.shClosedByAt, { name: shift.closedByName ?? "—" })}{" "}
            <HallTime value={shift.closedAt} timeZone={tz} />
          </>
        )}
        .{" "}
        <Link className="underline" href={`/halls/${hallId}/shifts`}>
          {t.shAllShifts}
        </Link>
      </p>

      <section aria-labelledby="sum-h">
        <h2 id="sum-h" className="mb-2 text-lg font-medium">
          {t.shCashSummary}
        </h2>
        <table className="w-full max-w-xl text-sm">
          <caption className="sr-only">{t.shSumCaption}</caption>
          <tbody>
            {lines.map(([label, minor]) => (
              <tr key={label} className="border-b border-border">
                <th scope="row" className="py-2 text-start font-normal">
                  {t[label]}
                </th>
                <td className="py-2 text-end tabular-nums">
                  <Money minor={minor} currency={c} />
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="py-2 text-start font-medium">
                {t.slExpected}
              </th>
              <td className="py-2 text-end font-medium tabular-nums">
                <Money minor={shift.expectedCashMinor} currency={c} />
              </td>
            </tr>
            {shift.status === "closed" && shift.countedCashMinor !== null && (
              <>
                <tr>
                  <th scope="row" className="py-1 text-start font-normal">
                    {t.colCounted}
                  </th>
                  <td className="py-1 text-end tabular-nums">
                    <Money minor={shift.countedCashMinor} currency={c} />
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="py-1 text-start font-medium">
                    {t.stDifference}
                  </th>
                  <td className="py-1 text-end font-medium tabular-nums">
                    <Money minor={shift.differenceMinor ?? 0} currency={c} />
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
        {shift.overrideReason && (
          <p className="mt-2 text-sm text-warning">
            {tpl(t.shOverrideNote, { n: shift.unpaidCount ?? 0, reason: shift.overrideReason })}
          </p>
        )}
      </section>

      {canClose && unpaid === null && (
        <p role="alert" className="text-sm text-danger">
          {t.shUnpaidFail}
        </p>
      )}
      {canClose && unpaid && (
        <CloseShiftStepper hallId={hallId} timeZone={tz} shift={shift} unpaid={unpaid} />
      )}

      <section aria-labelledby="mv-h" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="mv-h" className="text-lg font-medium">
            {t.mvTitle}
          </h2>
          {shift.status === "open" && (
            <PermissionGate permission="payment.adjust">
              <RecordMovementButton hallId={hallId} shiftId={shift.id} />
            </PermissionGate>
          )}
        </div>
        <MovementsList movements={movements?.rows ?? []} timeZone={tz} />
      </section>
    </div>
  );
}

export default function ShiftDetailPage({ params }: PageProps<"/halls/[hallId]/shifts/[shiftId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <ShiftDetail params={params} />
    </Suspense>
  );
}
