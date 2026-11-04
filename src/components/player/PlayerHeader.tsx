import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { getMyContext } from "@/lib/auth/session";
import type { Messages } from "@/lib/i18n/messages";
import { Logo, Wordmark } from "@/components/brand/Brand";
import { LanguageToggle } from "./LanguageToggle";
import { AccountMenu, BottomTabs, NavLinks, type NavLabels } from "./PlayerNav";

export { Logo, Wordmark };

const labelsOf = (t: Messages): NavLabels => ({
  home: t.navHome,
  bookings: t.myBookings,
  account: t.navAccount,
  signOut: t.signOut,
  close: t.navClose,
});

async function HeaderEnd({ next, t }: { next?: string; t: Messages }) {
  const ctx = await getMyContext();
  const labels = labelsOf(t);
  if (!ctx) {
    const href = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
    return (
      <>
        <NavLinks labels={labels} signedIn={false} />
        <div className="ms-auto flex items-center gap-1.5">
          <LanguageToggle />
          <Button asChild>
            <Link href={href}>{t.signIn}</Link>
          </Button>
        </div>
      </>
    );
  }
  const user = {
    name: ctx.profile.username ?? ctx.profile.display_name ?? ctx.profile.email ?? "",
    email: ctx.profile.email ?? "",
  };
  return (
    <>
      <NavLinks labels={labels} signedIn />
      <div className="ms-auto flex items-center gap-1.5">
        <LanguageToggle />
        <AccountMenu user={user} labels={labels} />
      </div>
    </>
  );
}

async function MobileTabs({ t }: { t: Messages }) {
  const ctx = await getMyContext();
  if (!ctx) return null;
  const user = {
    name: ctx.profile.username ?? ctx.profile.display_name ?? ctx.profile.email ?? "",
    email: ctx.profile.email ?? "",
  };
  return <BottomTabs user={user} labels={labelsOf(t)} />;
}

/**
 * Player navigation. Desktop: a top bar with links and an account dropdown. Phones: a slim top bar
 * (brand, language) plus a bottom tab bar within thumb reach. Browsing is open; signing in is only
 * needed to book.
 */
export function PlayerHeader({ next, t }: { next?: string; t: Messages }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 md:h-16 md:gap-4">
          <Link
            href="/"
            className="flex min-h-11 items-center gap-2.5 rounded-xl text-xl focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Logo size={34} className="rounded-xl border border-border" />
            <Wordmark />
          </Link>
          <Suspense fallback={<div className="ms-auto h-10 w-28" />}>
            <HeaderEnd next={next} t={t} />
          </Suspense>
        </div>
      </header>
      <Suspense fallback={null}>
        <MobileTabs t={t} />
      </Suspense>
    </>
  );
}
