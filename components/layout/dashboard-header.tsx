"use client";

import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import LogoutButton from "@/components/ui/logout-button";
import { LanguageToggle } from "@/components/language-toggle";
import { Gamepad2, ChevronRight, Wifi } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface DashboardHeaderProps {
  hallName: string;
  hallId?: string;
  breadcrumbs?: BreadcrumbItem[];
}

export default function DashboardHeader({ hallName, hallId, breadcrumbs }: DashboardHeaderProps) {
  return (
    <header className="flex items-center gap-3 px-5 h-14 shrink-0 border-b border-border/60 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      {/* Logo */}
      <Link href="/halls" className="flex items-center gap-2 shrink-0 group">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all group-hover:scale-105"
          style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.3)" }}
        >
          <Gamepad2 size={15} style={{ color: "oklch(0.65 0.22 280)" }} />
        </div>
        <span className="text-sm font-bold tracking-tight hidden sm:block">
          <span style={{ color: "oklch(0.55 0.26 280)" }}>Arc</span>
          <span style={{ color: "oklch(0.82 0.14 200)" }}>adia</span>
        </span>
      </Link>

      <Separator orientation="vertical" className="h-5 opacity-30" />

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm overflow-hidden" aria-label="Breadcrumb">
        {hallId ? (
          <Link href="/halls" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            Halls
          </Link>
        ) : (
          <span className="text-muted-foreground shrink-0">Halls</span>
        )}

        {hallId && (
          <>
            <ChevronRight size={13} className="text-border shrink-0" />
            {breadcrumbs && breadcrumbs.length > 0 ? (
              <Link
                href={`/dashboard/${hallId}`}
                className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[120px]"
              >
                {hallName}
              </Link>
            ) : (
              <span className="text-foreground font-medium truncate max-w-[160px]">{hallName}</span>
            )}
          </>
        )}

        {breadcrumbs?.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1 shrink-0">
            <ChevronRight size={13} className="text-border" />
            {crumb.href ? (
              <Link href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-foreground font-medium">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Live indicator */}
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
        <Wifi size={12} className="text-green-500" />
        <span>Live</span>
      </div>

      <LanguageToggle />
      <LogoutButton />
    </header>
  );
}
