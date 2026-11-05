"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { withParams } from "@/lib/query/searchParams";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { tpl } from "@/lib/i18n/messages";

/**
 * URL-driven pagination: state lives in the query string so back/forward and links work.
 * With a single page only the total is shown, since two dead buttons help nobody.
 */
export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => `${pathname}?${withParams(params, { page: String(p) })}`;
  const summary = (
    <span className="text-sm text-muted">
      {pages > 1 && <>{tpl(t.cmPage, { page, pages })} · </>}
      {tpl(t.cmTotal, { n: total })}
    </span>
  );
  if (pages <= 1) return <p className="pt-2 text-center sm:text-start">{summary}</p>;

  const button =
    "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-medium transition-colors sm:flex-none";
  const off = "pointer-events-none opacity-40";

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="text-center sm:text-start">{summary}</div>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className={cn(button, "hover:bg-neutral-bg")} href={href(page - 1)} rel="prev">
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
            {t.cmPrevious}
          </Link>
        ) : (
          <span className={cn(button, off)} aria-disabled>
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
            {t.cmPrevious}
          </span>
        )}
        {page < pages ? (
          <Link
            className={cn(button, "border-primary/50 bg-primary/15 hover:bg-primary/25")}
            href={href(page + 1)}
            rel="next"
          >
            {t.cmNext}
            <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </Link>
        ) : (
          <span className={cn(button, off)} aria-disabled>
            {t.cmNext}
            <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
