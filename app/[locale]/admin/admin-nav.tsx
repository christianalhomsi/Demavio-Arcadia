"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Building2, Users, Plus } from "lucide-react";

const NAV = [
  { label: "Overview",   href: "/admin",           icon: LayoutDashboard, exact: true },
  { label: "Halls",      href: "/admin/halls",      icon: Building2 },
  { label: "New Hall",   href: "/admin/halls/new",  icon: Plus },
  { label: "Users",      href: "/admin/users",      icon: Users },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-0.5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-3 mb-3">
        Admin Panel
      </p>
      {NAV.map(({ label, href, icon: Icon, exact }) => {
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
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
