"use client";

import { CalendarDays, ChevronDown, House, LogOut, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { SlidingPillNav } from "@/components/shell/SlidingPillNav";
import { cn } from "@/lib/cn";
import { morphRef } from "@/lib/ui/morph";

export type NavLabels = {
  home: string;
  bookings: string;
  account: string;
  signOut: string;
  close: string;
};
export type NavUser = { name: string; email: string };

function useSection() {
  const path = usePathname();
  return {
    home: path === "/" || path.startsWith("/book"),
    bookings: path.startsWith("/reservations"),
  };
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent font-bold text-primary-foreground",
        className,
      )}
    >
      {initial(name)}
    </span>
  );
}

/** Desktop links in the top bar. Phones use BottomTabs instead. */
export function NavLinks({ labels, signedIn }: { labels: NavLabels; signedIn: boolean }) {
  const on = useSection();
  const link = (active: boolean) =>
    cn(
      "inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-colors",
      active
        ? "bg-primary/20 text-foreground ring-1 ring-primary/50"
        : "text-muted hover:bg-neutral-bg hover:text-foreground",
    );
  return (
    <nav aria-label={labels.home} className="hidden items-center gap-1 md:flex">
      <Link href="/" aria-current={on.home ? "page" : undefined} className={link(on.home)}>
        <House className="h-[18px] w-[18px]" aria-hidden />
        {labels.home}
      </Link>
      {signedIn && (
        <Link
          href="/reservations"
          aria-current={on.bookings ? "page" : undefined}
          className={link(on.bookings)}
        >
          <CalendarDays className="h-[18px] w-[18px]" aria-hidden />
          {labels.bookings}
        </Link>
      )}
    </nav>
  );
}

function AccountPanel({
  sheet,
  user,
  labels,
  onClose,
}: {
  sheet: boolean;
  user: NavUser;
  labels: NavLabels;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn("fixed inset-0 z-50", sheet ? "bg-scrim" : "bg-transparent")}
      />
      <div
        ref={morphRef}
        data-morph="pending"
        role="dialog"
        aria-label={labels.account}
        className={cn(
          "morph-pop z-50 border border-border bg-surface-raised",
          sheet
            ? "fixed inset-x-0 bottom-0 rounded-t-3xl px-4 pt-3 pb-[calc(1rem+var(--safe-bottom))] shadow-float"
            : "absolute end-0 top-full mt-2 w-72 rounded-2xl p-2 shadow-card",
        )}
      >
        {sheet && (
          <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-muted/40" />
        )}
        <div className="flex items-center gap-3 p-2">
          <Avatar name={user.name} className="h-12 w-12 text-lg" />
          <div className="min-w-0 flex-1 text-start">
            <p className="truncate font-semibold">{user.name}</p>
            <p dir="ltr" className="truncate text-sm text-muted rtl:text-end">
              {user.email}
            </p>
          </div>
          {sheet && (
            <button
              type="button"
              onClick={onClose}
              aria-label={labels.close}
              className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-muted active:bg-neutral-bg"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
        <div className="my-2 h-px bg-border" />
        <form action="/auth/signout" method="post">
          <input type="hidden" name="next" value="/" />
          <button
            type="submit"
            className="flex h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium text-danger transition-colors hover:bg-danger-bg active:bg-danger-bg"
          >
            <LogOut className="h-[18px] w-[18px] rtl:-scale-x-100" aria-hidden />
            {labels.signOut}
          </button>
        </form>
      </div>
    </>
  );
}

/** Desktop: avatar + name in the top bar opening a dropdown with the account and sign out. */
export function AccountMenu({ user, labels }: { user: NavUser; labels: NavLabels }) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  return (
    <div className="relative hidden md:block">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={labels.account}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-11 cursor-pointer items-center gap-2 rounded-full border py-1 ps-1 pe-3 text-sm font-medium transition-colors",
          open ? "border-primary/60 bg-primary/15" : "border-border bg-surface hover:bg-neutral-bg",
        )}
      >
        <Avatar name={user.name} className="h-8 w-8 text-sm" />
        <span className="max-w-32 truncate">{user.name}</span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && <AccountPanel sheet={false} user={user} labels={labels} onClose={close} />}
    </div>
  );
}

/** Phones: the shared sliding-pill bar (home, bookings, account); the account tab opens a bottom sheet. */
export function BottomTabs({ user, labels }: { user: NavUser; labels: NavLabels }) {
  const on = useSection();
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const icon = "h-6 w-6";
  return (
    <>
      <SlidingPillNav
        label={labels.home}
        items={[
          {
            key: "home",
            label: labels.home,
            href: "/",
            active: on.home && !open,
            icon: <House className={icon} />,
          },
          {
            key: "bookings",
            label: labels.bookings,
            href: "/reservations",
            active: on.bookings && !open,
            icon: <CalendarDays className={icon} />,
          },
          {
            key: "account",
            label: labels.account,
            onClick: () => setOpen(true),
            active: open,
            expanded: open,
            icon: <UserRound className={icon} />,
          },
        ]}
      />
      {open && <AccountPanel sheet user={user} labels={labels} onClose={close} />}
    </>
  );
}
