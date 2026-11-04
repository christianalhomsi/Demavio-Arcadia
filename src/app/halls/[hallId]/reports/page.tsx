import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { permissionForPath } from "@/components/shell/nav";
import { Skeleton } from "@/components/ui/skeleton";
import { getHallTimeZone } from "@/features/halls/queries";
import { BreakdownView } from "@/features/reports/components/BreakdownView";
import { ReportView } from "@/features/reports/components/ReportView";
import { presetPeriods, resolvePeriod } from "@/features/reports/period";
import { getBreakdown, getFinancialSummary } from "@/features/reports/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Reports" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Reports({
  params,
  searchParams,
}: {
  params: Promise<{ hallId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hallId } = await params;
  await requireHallPermission(hallId, permissionForPath("/reports"));
  const sp = await searchParams;
  const tz = await getHallTimeZone(hallId);
  const period = resolvePeriod({ from: one(sp.from), to: one(sp.to) }, tz);
  const [summary, breakdown] = await Promise.all([
    getFinancialSummary(hallId, period.start, period.end),
    getBreakdown(hallId, period.start, period.end),
  ]);
  if (!summary || !breakdown) return <ErrorState message={(await getT()).t.rpLoadFail} />;
  return (
    <div className="space-y-8">
      <ReportView hallId={hallId} summary={summary} period={period} presets={presetPeriods(tz)} />
      <BreakdownView rows={breakdown} currency={summary.currency} />
    </div>
  );
}

export default function ReportsPage({
  params,
  searchParams,
}: PageProps<"/halls/[hallId]/reports">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Reports params={params} searchParams={searchParams} />
    </Suspense>
  );
}
