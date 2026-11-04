import { Suspense } from "react";
import { LocaleFrame } from "@/components/i18n/LocaleFrame";
import { PlatformShell } from "@/components/shell/PlatformShell";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePlatformRole } from "@/lib/auth/guards";

import type { PlatformNavItem } from "@/components/shell/PlatformShell";

const ITEMS: PlatformNavItem[] = [
  { labelKey: "navOverview", href: "/admin", icon: "overview" },
  { labelKey: "plNavTenants", href: "/admin/halls", icon: "tenants", group: "plGrpCustomers" },
  { labelKey: "spNav", href: "/admin/plans", icon: "plans", group: "plGrpCustomers" },
  { labelKey: "slNavRequests", href: "/admin/requests", icon: "requests", group: "plGrpCustomers" },
  { labelKey: "plNavSalesTeam", href: "/admin/sales", icon: "agents", group: "plGrpCustomers" },
  { labelKey: "plNavUsers", href: "/admin/users", icon: "users", group: "plGrpPlatform" },
  { labelKey: "plNavHealth", href: "/admin/monitoring", icon: "health", group: "plGrpPlatform" },
  { labelKey: "plNavAudit", href: "/admin/audit", icon: "audit", group: "plGrpPlatform" },
];

/** Non-super-admins get a 404 here, before any admin chrome renders. */
async function AdminFrame({ children }: { children: React.ReactNode }) {
  await requirePlatformRole("super_admin");
  return (
    <LocaleFrame>
      <PlatformShell titleKey="plAdminTitle" items={ITEMS}>
        {children}
      </PlatformShell>
    </LocaleFrame>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-40" />}>
      <AdminFrame>{children}</AdminFrame>
    </Suspense>
  );
}
