import { authorizeHall } from "@/lib/auth/authorize";
import { getMyContext } from "@/lib/auth/session";
import { callRpc } from "@/lib/actions/rpc";
import { buildSummaryCsv } from "@/features/reports/export";
import { resolvePeriod } from "@/features/reports/period";
import { getFinancialSummary } from "@/features/reports/queries";
import { getHallTimeZone } from "@/features/halls/queries";

/**
 * GET /halls/[hallId]/reports/export?from=&to= : CSV of the financial summary (ACC-009).
 * Authorized on the server (membership + report.financial.view); the RPC re-checks and writes the
 * audit entry BEFORE any data is returned, so an export can never go unrecorded.
 */
export async function GET(request: Request, { params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  const ctx = await getMyContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const access = authorizeHall(ctx, hallId, "report.financial.view");
  if (access.status === "not_found") return new Response("Not found", { status: 404 });
  if (access.status === "forbidden") return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const tz = await getHallTimeZone(hallId);
  const period = resolvePeriod(
    {
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    },
    tz,
  );

  const audited = await callRpc<null>("record_report_export", {
    p_hall_id: hallId,
    p_report: "financial_summary",
    p_from: period.start.toISOString(),
    p_to: period.end.toISOString(),
  });
  if (!audited.ok)
    return new Response("Forbidden", { status: audited.code === "FORBIDDEN" ? 403 : 400 });

  const summary = await getFinancialSummary(hallId, period.start, period.end);
  if (!summary) return new Response("Report unavailable", { status: 502 });

  return new Response(buildSummaryCsv(summary, period), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="financial-summary-${period.from}_${period.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
