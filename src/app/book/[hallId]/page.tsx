import { ChevronRight, Gamepad2, MapPin, Monitor } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { PlayerPage } from "@/components/player/PlayerPage";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicHall, listPublicDevices, listPublicHalls } from "@/features/booking/queries";
import type { PublicDevice } from "@/features/booking/queries";
import { hallCoverUrl } from "@/features/halls/cover";
import { isUuid } from "@/lib/auth/authorize";
import { getT } from "@/lib/i18n/server";

/** Devices grouped by what the player thinks in: "PS5", "PC"... (falls back to the device type). */
function groupDevices(devices: PublicDevice[], pc: string, console: string) {
  const groups = new Map<string, PublicDevice[]>();
  for (const d of devices) {
    const key = d.category?.trim() || (d.deviceType === "pc" ? pc : console);
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups.entries()];
}

async function Devices({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  if (!isUuid(hallId)) notFound();
  const [hall, devices, halls, { t }] = await Promise.all([
    getPublicHall(hallId),
    listPublicDevices(hallId),
    listPublicHalls(),
    getT(),
  ]);
  if (!hall || !devices) notFound();

  // The public hall RPC has no cover or address; the hall list does.
  const card = halls?.find((h) => h.id === hall.id);
  const cover = hallCoverUrl(card?.coverPath ?? null);
  const groups = groupDevices(devices, t.pc, t.console);

  return (
    <>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4 ltr:rotate-180" aria-hidden />
        {t.allHalls}
      </Link>

      <header className="relative mt-1 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/25 via-surface-raised to-accent/25">
        <div className="aspect-[16/7] sm:aspect-[16/5]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage URL
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <Gamepad2 className="absolute inset-0 m-auto h-12 w-12 text-primary/35" aria-hidden />
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-5 pb-4 pt-12">
          <h1 className="text-2xl font-semibold text-white">{hall.name}</h1>
          {card?.address && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/80">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{card.address}</span>
            </p>
          )}
        </div>
      </header>

      <p className="mt-6 text-base font-medium">{t.chooseDevice}</p>

      {devices.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={t.noDevices} description={t.noDevicesDesc} />
        </div>
      ) : (
        <div className="mt-3 space-y-7">
          {groups.map(([kind, items]) => (
            <section key={kind} aria-label={kind}>
              <h2 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {kind}
                <span className="rounded-full bg-neutral-bg px-2 py-0.5 text-[11px] font-medium tabular-nums">
                  {items.length}
                </span>
              </h2>
              <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((d) => {
                  const Icon = d.deviceType === "pc" ? Monitor : Gamepad2;
                  return (
                    <li key={d.id}>
                      <Link
                        href={`/book/${hall.id}/${d.id}`}
                        className="group flex min-h-16 items-center gap-3.5 rounded-2xl border border-border bg-surface px-4 py-3 shadow-card transition-[background-color,border-color,transform] duration-150 hover:border-primary/50 hover:bg-surface-raised active:scale-[0.99] active:bg-surface-raised"
                      >
                        <span
                          aria-hidden
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-accent"
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-semibold">{d.name}</span>
                          <span className="block truncate text-sm text-muted">
                            {d.deviceType === "pc" ? t.pc : t.console}
                          </span>
                        </span>
                        <ChevronRight
                          className="h-5 w-5 shrink-0 text-accent transition-transform group-active:translate-x-0.5 rtl:-scale-x-100 rtl:group-active:-translate-x-0.5"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function DevicesSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="mt-1 h-10 w-28" />
      <Skeleton className="aspect-[16/7] w-full rounded-3xl sm:aspect-[16/5]" />
      <Skeleton className="mt-6 h-5 w-40" />
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function HallPage({ params }: { params: Promise<{ hallId: string }> }) {
  return (
    <PlayerPage>
      <main className="mx-auto max-w-5xl px-4 pb-8 pt-4 sm:py-8">
        <Suspense fallback={<DevicesSkeleton />}>
          <Devices params={params} />
        </Suspense>
      </main>
    </PlayerPage>
  );
}
