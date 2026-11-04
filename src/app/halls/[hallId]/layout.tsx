import { Suspense } from "react";
import { LocaleFrame } from "@/components/i18n/LocaleFrame";
import { PermissionProvider } from "@/components/domain/PermissionGate";
import { AppShell } from "@/components/shell/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { requireHallMembership } from "@/lib/auth/guards";

async function HallFrame({
  params,
  children,
}: {
  params: Promise<{ hallId: string }>;
  children: React.ReactNode;
}) {
  const { hallId } = await params;
  // Authorization happens here on the server for every request. Non-members get a 404.
  const { membership } = await requireHallMembership(hallId);

  return (
    <LocaleFrame>
      <PermissionProvider permissions={membership.permissions}>
        <AppShell
          hallId={hallId}
          hallName={membership.hall_name}
          permissions={membership.permissions}
        >
          {children}
        </AppShell>
      </PermissionProvider>
    </LocaleFrame>
  );
}

export default function HallLayout({ params, children }: LayoutProps<"/halls/[hallId]">) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-40" />}>
      <HallFrame params={params}>{children}</HallFrame>
    </Suspense>
  );
}
