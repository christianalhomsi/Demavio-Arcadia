"use client";

import { Ellipsis, LogOut, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Logo } from "@/components/brand/Brand";
import { LanguageToggle } from "@/components/player/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Permission } from "@/contracts/permissions";
import { useI18n } from "@/lib/i18n/client";
import { HALL_NAV, NAV_KEYS, filterNav } from "./nav";
import { SlidingPillNav } from "./SlidingPillNav";
import { NAV_ICONS, Sidebar, isActive } from "./Sidebar";

/** Frequent destinations shown in the phone tab bar (max 4 + More, per mobile navigation guidance). */
const PRIMARY_TABS = ["Overview", "Sessions", "Invoices", "Shifts"];

/**
 * Authenticated application shell (UI-003). Navigation is filtered by permissions for display
 * only; every page and action is authorized again on the server.
 * Phones: slim header + bottom tab bar (thumb reach) with the rest under "More".
 * Large screens: persistent sidebar.
 */
export function AppShell({
  hallId,
  hallName,
  permissions,
  children,
}: {
  hallId: string;
  hallName: string;
  permissions: readonly Permission[];
  children: React.ReactNode;
}) {
  const { t: tr } = useI18n();
  const [more, setMore] = React.useState(false);
  const pathname = usePathname();
  const groups = filterNav(HALL_NAV, permissions);
  const base = `/halls/${hallId}`;
  const allItems = groups.flatMap((g) => g.items);
  const tabs = PRIMARY_TABS.map((l) => allItems.find((i) => i.label === l)).filter(
    (i): i is NonNullable<typeof i> => Boolean(i),
  );
  const moreActive =
    pathname.startsWith(base) && !tabs.some((t) => isActive(pathname, `${base}${t.path}`, t.path));

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        {tr.skipToContent}
      </a>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/75 sm:px-4">
        <button
          type="button"
          onClick={() => setMore(true)}
          aria-haspopup="dialog"
          aria-label={tr.navMenu}
          className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl hover:bg-neutral-bg lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <Logo size={32} />
        <span className="min-w-0 flex-1 truncate text-base font-semibold">{hallName}</span>
        <LanguageToggle />
        <form action="/auth/signout" method="post">
          <Button variant="ghost" size="sm" type="submit">
            <LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
            <span className="hidden sm:inline">{tr.logOut}</span>
            <span className="sr-only sm:hidden">{tr.logOut}</span>
          </Button>
        </form>
      </header>

      <div className="lg:grid lg:grid-cols-[17rem_1fr]">
        <aside className="hidden border-e border-border bg-surface lg:sticky lg:top-14 lg:block lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto">
          <Sidebar groups={groups} hallId={hallId} />
        </aside>
        <main
          id="main"
          className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-[calc(6rem+var(--safe-bottom))] pt-5 sm:px-6 sm:pt-6 lg:pb-8"
        >
          {children}
        </main>
      </div>

      <SlidingPillNav
        label={tr.navPrimary}
        items={[
          ...tabs.map((t) => {
            const href = `${base}${t.path}`;
            const Icon = NAV_ICONS[t.label];
            return {
              key: t.label,
              label: tr[NAV_KEYS[t.label] ?? "navMain"],
              href,
              active: isActive(pathname, href, t.path) && !more,
              icon: Icon ? <Icon className="h-6 w-6" /> : null,
            };
          }),
          {
            key: "more",
            label: tr.navMore,
            onClick: () => setMore(true),
            active: moreActive || more,
            expanded: more,
            icon: <Ellipsis className="h-6 w-6" />,
          },
        ]}
      />

      <Dialog open={more} onOpenChange={setMore}>
        <DialogContent title={tr.navMenu} description={hallName} className="lg:hidden">
          <div className="-mx-4 -mb-2">
            <Sidebar groups={groups} hallId={hallId} onNavigate={() => setMore(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
