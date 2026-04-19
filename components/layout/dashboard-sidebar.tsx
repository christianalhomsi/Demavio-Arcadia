"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Monitor, CalendarDays, DollarSign, ChevronLeft } from "lucide-react";

const NAV_ITEMS = [
  { key: "overview",     segment: "overview",     icon: LayoutDashboard },
  { key: "devices",      segment: "devices",      icon: Monitor },
  { key: "reservations", segment: "reservations", icon: CalendarDays },
  { key: "finance",      segment: "finance",      icon: DollarSign },
] as const;

export default function DashboardSidebar({ hallId }: { hallId: string }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const td = useTranslations("dashboard");

  return (
    <nav className="flex flex-col h-full p-3 gap-0.5" aria-label="Dashboard navigation">
      <p className="section-heading px-3 mb-3">{td("menu")}</p>

      {NAV_ITEMS.map(({ key, segment, icon: Icon }) => {
        const href = `/dashboard/${hallId}/${segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={segment}
            href={href}
            className={cn("nav-link", active && "nav-link-active")}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={16} className="shrink-0" />
            <span>{t(key)}</span>
          </Link>
        );
      })}

      <div className="mt-auto pt-4 border-t border-border/40">
        <Link href="/halls" className="nav-link text-muted-foreground/70">
          <ChevronLeft size={16} className="shrink-0" />
          <span>{td("allHalls")}</span>
        </Link>
      </div>
    </nav>
  );
}
