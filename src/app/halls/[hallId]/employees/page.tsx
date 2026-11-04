import { Suspense } from "react";
import { permissionForPath } from "@/components/shell/nav";
import { ErrorState } from "@/components/data/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { EmployeesPanel } from "@/features/employees/components/EmployeesPanel";
import { listHallMembers, listPendingInvitations } from "@/features/employees/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Employees" };

async function Employees({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  const { ctx } = await requireHallPermission(hallId, permissionForPath("/employees"));
  const [members, invitations] = await Promise.all([
    listHallMembers(hallId),
    listPendingInvitations(hallId),
  ]);
  if (!members || !invitations) return <ErrorState message={(await getT()).t.emLoadFail} />;

  return (
    <EmployeesPanel
      hallId={hallId}
      currentUserId={ctx.profile.id}
      members={members}
      invitations={invitations}
    />
  );
}

export default function EmployeesPage({ params }: PageProps<"/halls/[hallId]/employees">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Employees params={params} />
    </Suspense>
  );
}
