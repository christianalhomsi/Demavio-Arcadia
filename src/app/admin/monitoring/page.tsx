import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { ErrorState } from "@/components/data/ErrorState";
import { Badge } from "@/components/ui/badge";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { listHallHealth } from "@/features/admin/queries";
import { requirePlatformRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { tpl } from "@/lib/i18n/messages";

export const metadata = { title: "Monitoring" };

async function Monitoring() {
  await requirePlatformRole("super_admin");
  const halls = await listHallHealth();
  const { t } = await getT();
  if (!halls) return <ErrorState message={t.plMonLoadFail} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t.plMonTitle}</h1>
      </div>
      <p className="text-sm text-muted">{t.plMonNote}</p>
      {halls.length === 0 ? (
        <EmptyState title={t.plMonNoHalls} />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
          {halls.map((h) => {
            const offline = h.agentsTotal - h.agentsRecent;
            const problem = offline > 0 || h.commandsFailed24h > 0;
            return (
              <li key={h.hallId} className="space-y-1 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{h.hallName}</span>
                  <span className="flex gap-2">
                    {h.hallStatus === "inactive" && <Badge tone="warning">{t.plInactive}</Badge>}
                    <Badge tone={problem ? "warning" : "success"}>
                      {problem ? t.plAttention : t.plHealthy}
                    </Badge>
                  </span>
                </div>
                <p className="text-muted">
                  {tpl(t.plMonLine, {
                    on: h.agentsRecent,
                    total: h.agentsTotal,
                    never: h.agentsNeverSeen > 0 ? tpl(t.plNeverN, { n: h.agentsNeverSeen }) : "",
                    failed: h.commandsFailed24h,
                    pending: h.commandsPending,
                  })}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function MonitoringPage() {
  return (
    <Suspense fallback={<ListPageSkeleton rows={6} />}>
      <Monitoring />
    </Suspense>
  );
}
