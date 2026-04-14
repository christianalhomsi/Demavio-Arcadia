"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Overview",     segment: "overview",     icon: "⬡", desc: "Stats & activity" },
  { label: "Devices",      segment: "devices",      icon: "🖥",  desc: "Manage devices" },
  { label: "Reservations", segment: "reservations", icon: "📅", desc: "Bookings" },
  { label: "Finance",      segment: "finance",      icon: "💰", desc: "Cash & payments" },
] as const;

export default function DashboardSidebar({ hallId }: { hallId: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Dashboard navigation">
      <p className="section-heading px-3 mb-2">Navigation</p>
      {NAV_ITEMS.map(({ label, segment, icon }) => {
        const href = `/dashboard/${hallId}/${segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={segment} href={href}
            className={cn("nav-link", active && "nav-link-active")}
            aria-current={active ? "page" : undefined}>
            <span className="text-base leading-none w-5 text-center shrink-0">{icon}</span>
            <span>{label}</span>
          </Link>
        );
      })}

      {/* Back to halls */}
      <div className="mt-auto pt-4 border-t border-border/40 mt-6">
        <Link href="/halls" className="nav-link text-muted-foreground/70">
          <span className="text-base leading-none w-5 text-center shrink-0">←</span>
          <span>All Halls</span>
        </Link>
      </div>
    </nav>
  );
}
