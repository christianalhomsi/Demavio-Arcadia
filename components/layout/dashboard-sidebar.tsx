"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Monitor, CalendarDays, DollarSign, ChevronLeft, Settings } from "lucide-react";

const NAV_ITEMS = [
  { key: "overview",     segment: "overview",     icon: LayoutDashboard },
  { key: "devices",      segment: "devices",      icon: Monitor },
  { key: "reservations", segment: "reservations", icon: CalendarDays },
  { key: "finance",      segment: "finance",      icon: DollarSign },
  { key: "settings",     segment: "settings",     icon: Settings },
] as const;

interface DashboardSidebarProps {
  hallId: string;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export default function DashboardSidebar({ hallId, mobileMenuOpen, setMobileMenuOpen }: DashboardSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const td = useTranslations("dashboard");

  const NavContent = () => (
    <>
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
            onClick={() => setMobileMenuOpen(false)}
          >
            <Icon size={16} className="shrink-0" />
            <span>{t(key)}</span>
          </Link>
        );
      })}

      <div className="mt-auto pt-4 border-t border-border/40">
        <Link href="/halls" className="nav-link text-muted-foreground/70" onClick={() => setMobileMenuOpen(false)}>
          <ChevronLeft size={16} className="shrink-0" />
          <span>{td("allHalls")}</span>
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-300"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu */}
      <nav
        className={cn(
          "md:hidden fixed top-0 right-0 h-full w-72 bg-card border-l border-border/60 z-50 transform transition-transform duration-300 ease-in-out flex flex-col p-3 gap-0.5 shadow-2xl",
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        )}
        aria-label="Dashboard navigation"
      >
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/40">
          <p className="text-sm font-bold">{td("menu")}</p>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
        <div className="flex-1 flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ key, segment, icon: Icon }) => {
            const href = `/dashboard/${hallId}/${segment}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={segment}
                href={href}
                className={cn("nav-link", active && "nav-link-active")}
                aria-current={active ? "page" : undefined}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Icon size={16} className="shrink-0" />
                <span>{t(key)}</span>
              </Link>
            );
          })}
        </div>
        <div className="pt-4 border-t border-border/40">
          <Link href="/halls" className="nav-link text-muted-foreground/70" onClick={() => setMobileMenuOpen(false)}>
            <ChevronLeft size={16} className="shrink-0" />
            <span>{td("allHalls")}</span>
          </Link>
        </div>
      </nav>

      {/* Desktop Sidebar */}
      <nav className="hidden md:flex flex-col h-full p-3 gap-0.5" aria-label="Dashboard navigation">
        <NavContent />
      </nav>
    </>
  );
}
