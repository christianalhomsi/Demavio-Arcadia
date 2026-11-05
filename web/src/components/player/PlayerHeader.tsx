import { LogIn } from "lucide-react";
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
          <Button
            asChild
            className="h-10 rounded-full px-4 font-semibold shadow-[0_0_16px_var(--glow)] sm:h-10 sm:px-5"
          >
            <Link href={href}>
              <LogIn className="hidden h-4 w-4 rtl:-scale-x-100 min-[400px]:block" aria-hidden />
              {t.signIn}
            </Link>
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
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-gradient-to-r after:from-transparent after:via-primary/60 after:to-transparent after:content-['']">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-3 sm:px-4 md:h-16 md:gap-4">
          <Link
            href="/"
            className="flex min-h-11 min-w-0 shrink items-center gap-2.5 rounded-xl text-xl focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Logo size={34} className="shrink-0 rounded-xl border border-border" />
            <Wordmark className="hidden min-[340px]:inline" />
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
