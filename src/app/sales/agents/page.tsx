import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { AssignRoleButton } from "@/features/admin/components/AdminPanels";
import { AgentsList } from "@/features/sales/components/AgentsList";
import { listSalesAgents } from "@/features/sales/queries";
import { requirePlatformRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Sales agents" };

async function Agents() {
  await requirePlatformRole("sales_admin");
  const agents = await listSalesAgents();
  const { t } = await getT();
  if (!agents) return <ErrorState message={t.slAgentsLoadFail} />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.slAgentsTitle}</h1>
        <AssignRoleButton canManageAll={false} />
      </div>
      <AgentsList agents={agents} />
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <Agents />
    </Suspense>
  );
}
