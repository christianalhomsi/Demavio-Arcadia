"use client";

import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/cn";

export interface PillItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** A link when set; otherwise a button that calls `onClick` (menus and sheets). */
  href?: string;
  onClick?: () => void;
  active: boolean;
  /** For buttons that open a dialog or sheet. */
  expanded?: boolean;
}

/**
 * The phone navigation bar of every page: a floating capsule whose highlighted pill slides to the
 * item you pick. The pill moves with `transform` only, follows the writing direction (it travels the
 * other way in Arabic) and stays still when the user asks for reduced motion. Hidden from `lg` up,
 * where each area has its sidebar. Callers render any sheet next to it, never inside it.
 */
export function SlidingPillNav({
  label,
  items,
  className,
}: {
  label: string;
  items: PillItem[];
  className?: string;
}) {
  const n = Math.max(items.length, 1);
  const found = items.findIndex((i) => i.active);
  const index = Math.max(found, 0);

  return (
    <nav
      aria-label={label}
      className={cn(
        "fixed inset-x-3 bottom-[calc(0.75rem+var(--safe-bottom))] z-30 mx-auto max-w-md lg:hidden",
        className,
      )}
    >
      <ul
        className="relative flex items-stretch rounded-full border border-border bg-surface-raised/90 p-1.5 shadow-float backdrop-blur-md"
        style={{ "--i": index } as React.CSSProperties}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-1.5 start-1.5 rounded-full bg-primary/25 shadow-[0_0_18px_var(--glow)] ring-1 ring-primary/50",
            "[transform:translateX(calc(var(--i)*100%))] rtl:[transform:translateX(calc(var(--i)*-100%))]",
            "transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)] motion-reduce:transition-none",
            found < 0 && "opacity-0",
          )}
          style={{ width: `calc((100% - 0.75rem) / ${n})` }}
        />
        {items.map((item) => {
          const cls = cn(
            "relative z-10 flex h-14 w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full font-medium transition-colors duration-200 active:opacity-70",
            item.active ? "text-foreground" : "text-muted",
          );
          const inner = (
            <>
              <span
                aria-hidden
                className={cn(
                  "transition-transform duration-300",
                  item.active && "-translate-y-px scale-110",
                )}
              >
                {item.icon}
              </span>
              <span
                className={cn(
                  "line-clamp-2 max-w-full break-words px-0.5 text-center leading-[1.15]",
                  items.length > 4 ? "text-[10px]" : "text-[11px]",
                )}
              >
                {item.label}
              </span>
            </>
          );
          return (
            <li key={item.key} className="min-w-0 flex-1">
              {item.href ? (
                <Link
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={cls}
                >
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={item.onClick}
                  aria-haspopup="dialog"
                  aria-expanded={item.expanded}
                  className={cls}
                >
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
