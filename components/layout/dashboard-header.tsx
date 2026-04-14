"use client";

import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import LogoutButton from "@/components/ui/logout-button";

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
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all group-hover:scale-105"
          style={{ background: "oklch(0.55 0.26 280 / 0.15)", border: "1px solid oklch(0.55 0.26 280 / 0.3)" }}>
          🎮
        </div>
        <span className="text-sm font-bold tracking-tight hidden sm:block">
          <span style={{ color: "oklch(0.55 0.26 280)" }}>Gaming</span>
          <span style={{ color: "oklch(0.82 0.14 200)" }}>Hub</span>
        </span>
      </Link>

      <Separator orientation="vertical" className="h-5 opacity-30" />

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm overflow-hidden" aria-label="Breadcrumb">
        {hallId ? (
          <Link href="/halls" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            Halls
          </Link>
        ) : (
          <span className="text-muted-foreground shrink-0">Halls</span>
        )}

        {hallId && (
          <>
            <span className="text-border shrink-0">/</span>
            {breadcrumbs && breadcrumbs.length > 0 ? (
              <Link href={`/dashboard/${hallId}`}
                className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[120px]">
                {hallName}
              </Link>
            ) : (
              <span className="text-foreground font-medium truncate max-w-[160px]">{hallName}</span>
            )}
          </>
        )}

        {breadcrumbs?.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5 shrink-0">
            <span className="text-border">/</span>
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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status indicator */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground hidden sm:flex">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Live
      </div>

      <LogoutButton />
    </header>
  );
}
