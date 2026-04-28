"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Monitor, CalendarDays, DollarSign, ChevronLeft, ChevronDown, Settings, Package, Wallet, Receipt, FileText, Shield } from "lucide-react";

const NAV_ITEMS = [
  { key: "overview",     segment: "overview",     icon: LayoutDashboard },
  { key: "devices",      segment: "devices",      icon: Monitor },
  { key: "reservations", segment: "reservations", icon: CalendarDays },
  { key: "products",     segment: "products",     icon: Package },
  { key: "wallets",      segment: "wallets",      icon: Wallet },
  { 
    key: "finance", 
    segment: "finance", 
    icon: DollarSign,
    subItems: [
      { key: "financeOverview", segment: "finance", icon: LayoutDashboard },
      { key: "invoices", segment: "finance/invoices", icon: Receipt },
      { key: "cashRegister", segment: "finance/register", icon: Wallet },
      { key: "transactions", segment: "finance/transactions", icon: FileText },
      { key: "auditLogs", segment: "finance/audit-logs", icon: Shield },
    ]
  },
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
  const [financeExpanded, setFinanceExpanded] = useState(pathname.includes('/finance'));

  const NavContent = () => (
    <>
      <p className="section-heading px-2.5 sm:px-3 mb-2 sm:mb-3">{td("menu")}</p>

      {NAV_ITEMS.map((item) => {
        const { key, segment, icon: Icon, subItems } = item as any;
        const href = `/dashboard/${hallId}/${segment}`;
        const active = pathname === href || (subItems && pathname.startsWith(`/dashboard/${hallId}/${segment}/`));
        
        if (subItems) {
          const isExpanded = financeExpanded;
          return (
            <div key={segment}>
              <button
                onClick={() => setFinanceExpanded(!isExpanded)}
                className={cn("nav-link w-full", active && "nav-link-active")}
              >
                <Icon size={15} className="shrink-0" />
                <span className="flex-1 text-left">{t(key)}</span>
                <ChevronDown size={13} className={cn("transition-transform", isExpanded && "rotate-180")} />
              </button>
              {isExpanded && (
                <div className="ml-3 sm:ml-4 mt-1 space-y-0.5">
                  {subItems.map((subItem: any) => {
                    const subHref = `/dashboard/${hallId}/${subItem.segment}`;
                    const subActive = pathname === subHref;
                    return (
                      <Link
                        key={subItem.segment}
                        href={subHref}
                        className={cn("nav-link text-xs sm:text-sm", subActive && "nav-link-active")}
                        aria-current={subActive ? "page" : undefined}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <subItem.icon size={13} className="shrink-0" />
                        <span>{td(subItem.key)}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }
        
        return (
          <Link
            key={segment}
            href={href}
            className={cn("nav-link", active && "nav-link-active")}
            aria-current={active ? "page" : undefined}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Icon size={15} className="shrink-0" />
            <span>{t(key)}</span>
          </Link>
        );
      })}

      <div className="mt-auto pt-3 sm:pt-4 border-t border-border/40">
        <Link href="/halls" className="nav-link text-muted-foreground/70" onClick={() => setMobileMenuOpen(false)}>
          <ChevronLeft size={15} className="shrink-0" />
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
          "md:hidden fixed top-0 right-0 h-full w-64 sm:w-72 bg-card border-l border-border/60 z-50 transform transition-transform duration-300 ease-in-out flex flex-col p-2.5 sm:p-3 gap-0.5 shadow-2xl",
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        )}
        aria-label="Dashboard navigation"
      >
        <div className="flex items-center justify-between mb-3 sm:mb-4 pb-2.5 sm:pb-3 border-b border-border/40">
          <p className="text-xs sm:text-sm font-bold">{td("menu")}</p>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1 sm:p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
        <div className="flex-1 flex flex-col gap-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const { key, segment, icon: Icon, subItems } = item as any;
            const href = `/dashboard/${hallId}/${segment}`;
            const active = pathname === href || (subItems && pathname.startsWith(`/dashboard/${hallId}/${segment}/`));
            
            if (subItems) {
              const isExpanded = financeExpanded;
              return (
                <div key={segment}>
                  <button
                    onClick={() => setFinanceExpanded(!isExpanded)}
                    className={cn("nav-link w-full", active && "nav-link-active")}
                  >
                    <Icon size={15} className="shrink-0" />
                    <span className="flex-1 text-left">{t(key)}</span>
                    <ChevronDown size={13} className={cn("transition-transform", isExpanded && "rotate-180")} />
                  </button>
                  {isExpanded && (
                    <div className="ml-3 sm:ml-4 mt-1 space-y-0.5">
                      {subItems.map((subItem: any) => {
                        const subHref = `/dashboard/${hallId}/${subItem.segment}`;
                        const subActive = pathname === subHref;
                        return (
                          <Link
                            key={subItem.segment}
                            href={subHref}
                            className={cn("nav-link text-xs sm:text-sm", subActive && "nav-link-active")}
                            aria-current={subActive ? "page" : undefined}
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            <subItem.icon size={13} className="shrink-0" />
                            <span>{td(subItem.key)}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            
            return (
              <Link
                key={segment}
                href={href}
                className={cn("nav-link", active && "nav-link-active")}
                aria-current={active ? "page" : undefined}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Icon size={15} className="shrink-0" />
                <span>{t(key)}</span>
              </Link>
            );
          })}
        </div>
        <div className="pt-3 sm:pt-4 border-t border-border/40">
          <Link href="/halls" className="nav-link text-muted-foreground/70" onClick={() => setMobileMenuOpen(false)}>
            <ChevronLeft size={15} className="shrink-0" />
            <span>{td("allHalls")}</span>
          </Link>
        </div>
      </nav>

      {/* Desktop Sidebar */}
      <nav className="hidden md:flex flex-col h-full p-2.5 sm:p-3 gap-0.5" aria-label="Dashboard navigation">
        <NavContent />
      </nav>
    </>
  );
}
