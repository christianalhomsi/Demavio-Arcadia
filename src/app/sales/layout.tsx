import { Suspense } from "react";
import { LocaleFrame } from "@/components/i18n/LocaleFrame";
import { PlatformShell, type PlatformNavItem } from "@/components/shell/PlatformShell";
import { Skeleton } from "@/components/ui/skeleton";
import { requirePlatformRole } from "@/lib/auth/guards";

/** Sales users only (404 otherwise). The Agents tab is for sales admins; the server enforces it too. */
async function SalesFrame({ children }: { children: React.ReactNode }) {
  const ctx = await requirePlatformRole(["sales_agent", "sales_admin"]);
  const items: PlatformNavItem[] = [
    { labelKey: "slNavHome", href: "/sales", icon: "overview" },
    { labelKey: "slNavRequests", href: "/sales/requests", icon: "requests" },
    ...(ctx.platform_roles.includes("sales_admin")
      ? ([
          { labelKey: "slNavCredits", href: "/sales/attribution", icon: "credits" },
          { labelKey: "navAgents", href: "/sales/agents", icon: "agents" },
        ] as PlatformNavItem[])
      : []),
    ...(ctx.platform_roles.includes("sales_agent")
      ? ([
          { labelKey: "slNavManager", href: "/sales/manager", icon: "agents" },
        ] as PlatformNavItem[])
      : []),
  ];
  return (
    <LocaleFrame>
      <PlatformShell titleKey="plSalesTitle" items={items}>
        {children}
      </PlatformShell>
    </LocaleFrame>
  );
}

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-40" />}>
      <SalesFrame>{children}</SalesFrame>
    </Suspense>
  );
}
