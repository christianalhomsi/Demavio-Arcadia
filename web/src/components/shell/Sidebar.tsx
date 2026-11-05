"use client";

import {
  Banknote,
  Scale,
  HandCoins,
  BadgePercent,
  Boxes,
  CalendarClock,
  Gamepad2,
  Package,
  History,
  LayoutDashboard,
  MonitorSmartphone,
  PlayCircle,
  ReceiptText,
  Settings,
  ShieldCheck,
  Tag,
  Terminal,
  Undo2,
  Users,
  Vault,
  Wallet,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { NAV_KEYS, type NavGroup } from "./nav";

/** One consistent outline icon set (stroke 2) keyed by nav label. */
export const NAV_ICONS: Record<string, LucideIcon> = {
  Overview: LayoutDashboard,
  Devices: Gamepad2,
  Reservations: CalendarClock,
  Sessions: PlayCircle,
  Products: Package,
  Agents: MonitorSmartphone,
  Commands: Terminal,
  Invoices: ReceiptText,
  Wallets: Wallet,
  Refunds: Undo2,
  Adjustments: Scale,
  Expenses: HandCoins,
  Shifts: Banknote,
  Registers: Vault,
  Reports: BarChart3,
  Pricing: Tag,
  Packages: Boxes,
  Discounts: BadgePercent,
  Employees: Users,
  Settings: Settings,
  "Audit log": ShieldCheck,
  "My activity": History,
};

export function isActive(pathname: string, href: string, path: string) {
  return path === "" ? pathname === href : pathname.startsWith(href);
}

export function Sidebar({
  groups,
  hallId,
  onNavigate,
}: {
  groups: NavGroup[];
  hallId: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const base = `/halls/${hallId}`;

  return (
    <nav aria-label={t.navMain} className="space-y-6 p-4">
      {groups.map((group) => (
        <div key={group.label}>
          <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted">
            {t[NAV_KEYS[group.label] ?? "navMain"]}
          </h2>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const href = `${base}${item.path}`;
              const active = isActive(pathname, href, item.path);
              const Icon = NAV_ICONS[item.label];
              return (
                <li key={item.label}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
                      "hover:bg-neutral-bg active:bg-neutral-bg",
                      active ? "bg-primary/10 font-semibold text-accent" : "text-foreground",
                    )}
                  >
                    {Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden />}
                    {t[NAV_KEYS[item.label] ?? "navMain"]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
