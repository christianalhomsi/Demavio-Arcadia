"use client";

import { ChevronRight, Gamepad2, MapPin, Search } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import type { Messages } from "@/lib/i18n/messages";
import { tpl } from "@/lib/i18n/messages";
import { pluralForm } from "@/lib/i18n/plural";

export interface HallCard {
  id: string;
  name: string;
  deviceCount: number;
  coverUrl: string | null;
  address: string | null;
  deviceKinds: string[];
}

/** "No devices yet", "1 device", "جهازان", "5 أجهزة", "12 جهاز": the right form for the count. */
function devicesLabel(t: Messages, locale: string, n: number): string {
  const form = pluralForm(locale, n);
  const text =
    n === 0
      ? t.devicesZero
      : form === "one"
        ? t.devicesOne
        : form === "two"
          ? t.devicesTwo
          : form === "few"
            ? t.devicesFew
            : t.devicesMany;
  return tpl(text, { n });
}

/** Step 1 of 3 (hall, device, time): where the player is, so the whole path is clear from the first screen. */
function Steps() {
  const { t } = useI18n();
  const steps = [t.stepHall, t.stepDevice, t.stepTime];
  // Three equal pills that share the row and shrink on narrow screens; from 420px they take their own
  // width and the connecting lines appear. Nothing here can push the page wider than the screen.
  return (
    <ol
      aria-label={t.stepsLabel}
      className="mt-4 flex w-full items-center gap-1.5 text-xs font-medium sm:gap-2"
    >
      {steps.map((label, i) => (
        <React.Fragment key={label}>
          {i > 0 && (
            <li
              aria-hidden
              className="hidden h-px w-5 shrink-0 bg-border min-[420px]:block sm:w-8"
            />
          )}
          <li
            aria-current={i === 0 ? "step" : undefined}
            className={cn(
              "inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border py-1 pe-2.5 ps-1 min-[420px]:flex-none min-[420px]:justify-start min-[420px]:gap-1.5 min-[420px]:pe-3",
              i === 0
                ? "border-primary/60 bg-primary/20 text-foreground"
                : "border-border bg-surface text-muted",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums",
                i === 0 ? "bg-primary text-primary-foreground" : "bg-neutral-bg",
              )}
            >
              {i + 1}
            </span>
            <span className="truncate">{label}</span>
          </li>
        </React.Fragment>
      ))}
    </ol>
  );
}

/**
 * The home page of the public player pages: a hero with the three booking steps, then one big tappable
 * card per hall. Search appears only when there are enough halls to need it. A hall with no devices
 * cannot be booked yet, so it is shown but not linked, with the reason.
 */
export function HallPicker({ halls }: { halls: HallCard[] }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? halls.filter((h) => h.name.toLowerCase().includes(q)) : halls;
  const searchable = halls.length > 5;

  return (
    <>
      <header>
        <h1 className="bg-gradient-to-r from-foreground to-accent bg-clip-text text-[1.75rem] font-bold leading-tight text-transparent sm:text-4xl">
          {t.homeTitle}
        </h1>
        <p className="mt-2 text-base text-muted">{t.homeSub}</p>
        <Steps />
      </header>

      {searchable && (
        <div className="relative mt-6">
          <label htmlFor="hall-search" className="sr-only">
            {t.searchHalls}
          </label>
          <Search
            className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            id="hall-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchHallsPh}
            autoComplete="off"
            className="h-12 w-full rounded-2xl border border-border bg-surface ps-10 pe-4 text-base placeholder:text-muted focus-visible:border-primary"
          />
        </div>
      )}

      {shown.length === 0 ? (
        <p
          role="status"
          className="mt-8 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted"
        >
          {t.noHallMatch}
        </p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {shown.map((h) => {
            const ready = h.deviceCount > 0;
            const cover = (
              <span
                aria-hidden
                className={cn(
                  "relative block aspect-[16/7] w-full overflow-hidden bg-gradient-to-br from-primary/25 via-surface-raised to-accent/25",
                  !ready && "grayscale",
                )}
              >
                {h.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage URL, already resized on upload
                  <img
                    src={h.coverUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Gamepad2 className="absolute inset-0 m-auto h-10 w-10 text-primary/40" />
                )}
              </span>
            );
            const body = (
              <span className="flex items-center gap-4 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-semibold">{h.name}</span>
                  {h.address && (
                    <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                      <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{h.address}</span>
                    </span>
                  )}
                  {ready ? (
                    <span className="mt-2 flex flex-wrap items-center gap-1.5">
                      {(h.deviceKinds ?? []).map((k) => (
                        <span
                          key={k}
                          className="rounded-full bg-neutral-bg px-2.5 py-0.5 text-xs font-medium"
                        >
                          {k}
                        </span>
                      ))}
                      <span className="text-xs text-muted">
                        {devicesLabel(t, locale, h.deviceCount)}
                      </span>
                    </span>
                  ) : (
                    <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                      <Gamepad2 className="h-4 w-4 shrink-0" aria-hidden />
                      {t.hallSoon}
                    </span>
                  )}
                </span>
                {ready && (
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-accent transition-transform group-active:translate-x-0.5 rtl:-scale-x-100 rtl:group-active:-translate-x-0.5"
                    aria-hidden
                  />
                )}
              </span>
            );
            return (
              <li key={h.id}>
                {ready ? (
                  <Link
                    href={`/book/${h.id}`}
                    className="group flex min-h-24 flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-card transition-[background-color,border-color,transform] duration-150 hover:border-primary/50 hover:bg-surface-raised active:scale-[0.99] active:bg-surface-raised"
                  >
                    {cover}
                    {body}
                  </Link>
                ) : (
                  <div
                    aria-disabled
                    className="flex min-h-24 flex-col overflow-hidden rounded-3xl border border-dashed border-border bg-surface/60 opacity-80"
                  >
                    {cover}
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
