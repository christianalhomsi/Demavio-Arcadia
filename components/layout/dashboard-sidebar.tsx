"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Overview",     segment: "overview",     icon: "⬡" },
  { label: "Devices",      segment: "devices",      icon: "🖥" },
  { label: "Reservations", segment: "reservations", icon: "📅" },
  { label: "Finance",      segment: "finance",      icon: "💰" },
] as const;

export default function DashboardSidebar({ hallId }: { hallId: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.map(({ label, segment, icon }) => {
        const href = `/dashboard/${hallId}/${segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={segment} href={href}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150"
            style={{
              background: active ? "var(--color-primary)" : "transparent",
              color: active ? "#fff" : "var(--color-muted)",
            }}>
            <span className="text-base leading-none">{icon}</span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
