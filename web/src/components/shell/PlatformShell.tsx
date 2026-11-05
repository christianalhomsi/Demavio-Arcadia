"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  Activity,
  BarChart3,
  Building2,
  ClipboardCheck,
  Handshake,
  Tags,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  ScrollText,
  UserCog,
  Users,
} from "lucide-react";
import { Logo } from "@/components/brand/Brand";
import { StackTableLabels } from "@/components/data/StackTableLabels";
import { LanguageToggle } from "@/components/player/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SlidingPillNav, type PillItem } from "./SlidingPillNav";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { tpl, type Messages } from "@/lib/i18n/messages";

/**
 * Icons are looked up by name here, inside the client component: a server layout cannot pass icon
 * components (functions) across the server/client boundary.
 */
const ICONS = {
  overview: LayoutDashboard,
  tenants: Building2,
  users: Users,
  health: Activity,
  audit: ScrollText,
  requests: ClipboardCheck,
  credits: Handshake,
  reports: BarChart3,
  agents: UserCog,
  plans: Tags,
} as const;

export interface PlatformNavItem {
  labelKey: keyof Messages;
  href: string;
  icon: keyof typeof ICONS;
  /** Optional sidebar heading; items with the same group sit together. */
  group?: keyof Messages;
}

/**
 * Shell for the platform areas (/admin, /sales): slim header, bottom tab bar on phones, sidebar on
 * large screens. Items are filtered by role on the server before they reach this component (UX only;
 * every page and action is authorized again on the server).
 */
export function PlatformShell({
  titleKey,
  items,
  children,
}: {
  titleKey: keyof Messages;
  items: PlatformNavItem[];
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const title = t[titleKey];
  const pathname = usePathname();
  const active = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const root = items[0]?.href;

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        {t.skipToContent}
      </a>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/90 px-3 backdrop-blur sm:px-4">
        <Logo size={32} />
        <span className="min-w-0 flex-1 truncate text-base font-semibold">{title}</span>
        <LanguageToggle />
        <form action="/auth/signout" method="post">
          <Button variant="ghost" size="sm" type="submit">
            <LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
            <span className="hidden sm:inline">{t.logOut}</span>
            <span className="sr-only sm:hidden">{t.logOut}</span>
          </Button>
        </form>
      </header>
      <div className="lg:grid lg:grid-cols-[15rem_1fr]">
        <aside className="hidden border-e border-border bg-surface lg:sticky lg:top-14 lg:block lg:h-[calc(100dvh-3.5rem)]">
          <nav aria-label={title} className="h-full space-y-1 overflow-y-auto p-4">
            {items.map((i, idx) => {
              const on = active(i.href, i.href === root);
              const Icon = ICONS[i.icon];
              const heading = i.group && i.group !== items[idx - 1]?.group ? i.group : null;
              return (
                <React.Fragment key={i.href}>
                  {heading && (
                    <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">
                      {t[heading]}
                    </p>
                  )}
                  <Link
                    href={i.href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-xl border-s-2 px-3 text-sm transition-colors hover:bg-neutral-bg",
                      on
                        ? "border-accent bg-primary/10 font-semibold text-accent"
                        : "border-transparent text-foreground",
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                    {t[i.labelKey]}
                  </Link>
                </React.Fragment>
              );
            })}
          </nav>
        </aside>
        <StackTableLabels />
        <main
          id="main"
          className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-[calc(6rem+var(--safe-bottom))] pt-5 sm:px-6 sm:pt-6 lg:pb-8"
        >
          {children}
        </main>
      </div>
      <TabBar title={tpl(t.plTabs, { title })} items={items} root={root} active={active} />
    </div>
  );
}

/** Phone bar: the shared sliding-pill nav with four main sections; the rest sit in a "More" sheet. */
function TabBar({
  title,
  items,
  root,
  active,
}: {
  title: string;
  items: PlatformNavItem[];
  root: string | undefined;
  active: (href: string, exact: boolean) => boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const overflow = items.length > 5;
  const main = overflow ? items.slice(0, 4) : items;
  const rest = overflow ? items.slice(4) : [];
  const restActive = rest.some((i) => active(i.href, false));
  const pill: PillItem[] = [
    ...main.map((i) => {
      const Icon = ICONS[i.icon];
      return {
        key: i.href,
        label: t[i.labelKey],
        href: i.href,
        active: active(i.href, i.href === root) && !open,
        icon: <Icon className="h-6 w-6" />,
      };
    }),
    ...(overflow
      ? [
          {
            key: "more",
            label: t.plMore,
            onClick: () => setOpen(true),
            active: restActive || open,
            expanded: open,
            icon: <MoreHorizontal className="h-6 w-6" />,
          },
        ]
      : []),
  ];
  return (
    <>
      <SlidingPillNav label={title} items={pill} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t.plMoreTitle}>
          <ul className="space-y-1">
            {items.map((i) => {
              const Icon = ICONS[i.icon];
              const on = active(i.href, i.href === root);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={() => setOpen(false)}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl px-3 text-base",
                      on ? "bg-primary/10 font-semibold text-accent" : "active:bg-neutral-bg",
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                    {t[i.labelKey]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
