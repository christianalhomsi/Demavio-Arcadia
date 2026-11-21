import { Suspense } from "react";
import { permissionForPath } from "@/components/shell/nav";
import { ErrorState } from "@/components/data/ErrorState";
import { TablePageSkeleton } from "@/components/ui/skeleton";
import { EmployeesPanel } from "@/features/employees/components/EmployeesPanel";
import { listHallMembers, listPendingInvitations } from "@/features/employees/queries";
import { getHallCurrency } from "@/features/invoices/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Employees" };

async function Employees({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  const { ctx, membership } = await requireHallPermission(hallId, permissionForPath("/employees"));
  const [members, invitations, currency] = await Promise.all([
    listHallMembers(hallId),
    listPendingInvitations(hallId),
    getHallCurrency(hallId),
  ]);
  if (!members || !invitations || !currency)
    return <ErrorState message={(await getT()).t.emLoadFail} />;

  return (
    <EmployeesPanel
      hallId={hallId}
      currentUserId={ctx.profile.id}
      isOwner={membership.role === "owner"}
      currency={currency}
      members={members}
      invitations={invitations}
    />
  );
}

export default function EmployeesPage({ params }: PageProps<"/halls/[hallId]/employees">) {
  return (
    <Suspense fallback={<TablePageSkeleton cols={4} />}>
      <Employees params={params} />
    </Suspense>
  );
}
