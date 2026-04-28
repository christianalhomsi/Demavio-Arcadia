"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import LogoutButton from "@/components/ui/logout-button";
import { LanguageToggle } from "@/components/language-toggle";
import { ChevronRight, Menu } from "lucide-react";
import Logo from "@/components/ui/logo";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface DashboardHeaderProps {
  hallName: string;
  hallId?: string;
  breadcrumbs?: BreadcrumbItem[];
  onMenuClick?: () => void;
}

export default function DashboardHeader({ hallName, hallId, breadcrumbs, onMenuClick }: DashboardHeaderProps) {
  const t = useTranslations("nav");
  return (
    <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-5 h-12 sm:h-14 shrink-0 border-b border-border/60 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      {/* Mobile Menu Button */}
      {onMenuClick && (
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden h-8 w-8 p-0 cursor-pointer"
          onClick={onMenuClick}
        >
          <Menu size={18} />
        </Button>
      )}

      {/* Logo */}
      <Logo href="/halls" size="sm" showText={true} />

      <Separator orientation="vertical" className="h-4 sm:h-5 opacity-30 hidden sm:block" />

      {/* Breadcrumbs */}
      <nav className="hidden md:flex items-center gap-1 text-xs sm:text-sm overflow-hidden" aria-label="Breadcrumb">
        {hallId ? (
          <Link href="/halls" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            {t("halls")}
          </Link>
        ) : (
          <span className="text-muted-foreground shrink-0">{t("halls")}</span>
        )}

        {hallId && (
          <>
            <ChevronRight size={12} className="text-border shrink-0" />
            {breadcrumbs && breadcrumbs.length > 0 ? (
              <Link
                href={`/dashboard/${hallId}`}
                className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[100px] sm:max-w-[120px]"
              >
                {hallName}
              </Link>
            ) : (
              <span className="text-foreground font-medium truncate max-w-[120px] sm:max-w-[160px]">{hallName}</span>
            )}
          </>
        )}

        {breadcrumbs?.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1 shrink-0">
            <ChevronRight size={12} className="text-border" />
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

      <div className="flex items-center gap-1 sm:gap-1.5">
        <LanguageToggle />
        <LogoutButton />
      </div>
    </header>
  );
}
