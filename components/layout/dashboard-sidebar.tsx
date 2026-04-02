"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Overview",     segment: "overview"     },
  { label: "Devices",      segment: "devices"      },
  { label: "Reservations", segment: "reservations" },
  { label: "Finance",      segment: "finance"      },
] as const;

export default function DashboardSidebar({ hallId }: { hallId: string }) {
  const pathname = usePathname();

  return (
    <nav style={nav}>
      {NAV_ITEMS.map(({ label, segment }) => {
        const href = `/dashboard/${hallId}/${segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={segment} href={href} style={link(active)}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

const nav: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.125rem",
  padding: "1rem 0.75rem",
};

const link = (active: boolean): React.CSSProperties => ({
  display: "block",
  padding: "0.5rem 0.75rem",
  borderRadius: "0.375rem",
  fontSize: "0.875rem",
  fontWeight: active ? 600 : 400,
  color: active ? "#111827" : "#6b7280",
  background: active ? "#f3f4f6" : "transparent",
  textDecoration: "none",
  transition: "background 0.1s, color 0.1s",
});
