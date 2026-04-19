"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Building2, Users, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

const NAV = [
  { labelKey: "overview",   href: "/admin",           icon: LayoutDashboard, exact: true },
  { labelKey: "halls",      href: "/admin/halls",      icon: Building2 },
  { labelKey: "newHall",   href: "/admin/halls/new",  icon: Plus },
  { labelKey: "users",      href: "/admin/users",      icon: Users },
];

export default function AdminNav() {
  const pathname = usePathname();
  const t = useTranslations('admin');

  return (
    <nav className="space-y-0.5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-3 mb-3">
        {t('adminPanel')}
      </p>
      {NAV.map(({ labelKey, href, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link key={href} href={href}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}>
            <Icon size={15} className="shrink-0" />
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
