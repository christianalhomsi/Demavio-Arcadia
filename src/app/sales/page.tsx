import Link from "next/link";
import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AddHallButton } from "@/features/admin/components/HallsPanels";
import { RequestHallButton } from "@/features/sales/components/SalesPanels";
import { listSubscriptionPlans } from "@/features/admin/queries";
import { listHallRequests, listMyTeam } from "@/features/sales/queries";
import { requirePlatformRole } from "@/lib/auth/guards";
import { tpl } from "@/lib/i18n/messages";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Sales" };

async function SalesHome() {
  const ctx = await requirePlatformRole(["sales_agent", "sales_admin"]);
  const isManager = ctx.platform_roles.includes("sales_admin");
  const [team, pendingRequests, plans] = await Promise.all([
    isManager ? listMyTeam() : null,
    listHallRequests({ status: "pending", limit: 50, offset: 0 }),
    listSubscriptionPlans(),
  ]);
  // Managers: requests they can decide. Agents: their own requests still waiting.
  const attention = (pendingRequests?.rows ?? []).filter((r) =>
    isManager ? r.canAct : true,
  ).length;
  const { t } = await getT();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.slTitle}</h1>
        {isManager ? (
          <AddHallButton plans={plans ?? []} />
        ) : (
          <RequestHallButton plans={plans ?? []} />
        )}
      </div>
      {attention > 0 && (
        <Link
          href="/sales/requests"
          className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm font-medium transition-colors active:bg-warning/20"
        >
          <span>{tpl(isManager ? t.slAttnManager : t.slAttnAgent, { n: attention })}</span>
          <span className="text-accent">{t.slAttnOpen}</span>
        </Link>
      )}
      <details className="group rounded-2xl border border-border bg-surface p-4 text-sm shadow-card">
        <summary className="cursor-pointer font-medium">{t.slHowTitle}</summary>
        <p className="mt-2 text-muted">{isManager ? t.slHowBodyManager : t.slHowBody}</p>
      </details>
      {isManager && (
        <section aria-labelledby="team-h" className="space-y-2">
          <h2 id="team-h" className="text-lg font-medium">
            {t.slTeamTitle}
          </h2>
          <p className="text-sm text-muted">{t.slTeamDesc}</p>
          {!team ? (
            <ErrorState message={t.slLoadFail} />
          ) : team.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm">
              <p className="font-medium">{t.slTeamEmpty}</p>
              <p className="mt-1 text-muted">{t.slTeamEmptyDesc}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
              {team.map((m) => (
                <li
                  key={m.userId}
                  className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.displayName ?? m.email}</span>
                    <span className="text-muted">
                      {tpl(t.slTeamLine, { email: m.email ?? "", sold: m.soldCount })}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {m.openRequests > 0 && (
                      <Badge tone="warning">{tpl(t.slTeamOpenReq, { n: m.openRequests })}</Badge>
                    )}
                    {m.status !== "active" && <Badge tone="neutral">{t.plInactive}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <SalesHome />
    </Suspense>
  );
}
