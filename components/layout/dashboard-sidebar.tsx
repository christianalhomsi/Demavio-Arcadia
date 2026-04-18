"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Monitor, CalendarDays, DollarSign, ChevronLeft } from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview",     segment: "overview",     icon: LayoutDashboard },
  { label: "Devices",      segment: "devices",      icon: Monitor },
  { label: "Reservations", segment: "reservations", icon: CalendarDays },
  { label: "Finance",      segment: "finance",      icon: DollarSign },
] as const;

export default function DashboardSidebar({ hallId }: { hallId: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col h-full p-3 gap-0.5" aria-label="Dashboard navigation">
      <p className="section-heading px-3 mb-3">Menu</p>

      {NAV_ITEMS.map(({ label, segment, icon: Icon }) => {
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
            <span>{label}</span>
          </Link>
        );
      })}

      <div className="mt-auto pt-4 border-t border-border/40">
        <Link href="/halls" className="nav-link text-muted-foreground/70">
          <ChevronLeft size={16} className="shrink-0" />
          <span>All Halls</span>
        </Link>
      </div>
    </nav>
  );
}
