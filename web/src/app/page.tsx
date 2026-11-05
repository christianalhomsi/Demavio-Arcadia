import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { HallPicker } from "@/components/player/HallPicker";
import { PlayerPage } from "@/components/player/PlayerPage";
import { Skeleton } from "@/components/ui/skeleton";
import { listPublicHalls } from "@/features/booking/queries";
import { hallCoverUrl } from "@/features/halls/cover";
import { isStaff, resolveLanding } from "@/lib/auth/context";
import { getMyContext } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

async function Halls() {
  // Staff (owners, employees, platform roles) go straight to their own dashboards.
  const ctx = await getMyContext();
  if (ctx && isStaff(ctx)) redirect(resolveLanding(ctx));

  const { t } = await getT();
  const halls = await listPublicHalls();
  if (!halls) return <EmptyState title={t.hallsUnavailable} description={t.hallsUnavailableDesc} />;
  if (halls.length === 0) return <EmptyState title={t.noHalls} description={t.noHallsDesc} />;
  // Halls that can be booked come first; the rest follow, in the order they were added.
  const ordered = [...halls].sort((a, b) => Number(b.deviceCount > 0) - Number(a.deviceCount > 0));
  return (
    <HallPicker
      halls={ordered.map((h) => ({
        id: h.id,
        name: h.name,
        deviceCount: h.deviceCount,
        coverUrl: hallCoverUrl(h.coverPath),
        address: h.address,
        deviceKinds: h.deviceKinds,
      }))}
    />
  );
}

/** Same shape as the real page, so nothing jumps when the halls arrive. */
function HallsSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-9 w-3/4 rounded-xl sm:h-10" />
      <Skeleton className="mt-2 h-6 w-2/3" />
      <div className="mt-4 flex w-full items-center gap-1.5 sm:gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            className="h-[30px] flex-1 rounded-full min-[420px]:w-28 min-[420px]:flex-none"
          />
        ))}
      </div>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex min-h-24 flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-card"
          >
            <Skeleton className="aspect-[16/7] w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
              <div className="flex gap-1.5 pt-0.5">
                <Skeleton className="h-6 w-14 rounded-full" />
                <Skeleton className="h-6 w-14 rounded-full" />
                <Skeleton className="h-4 w-16 self-center" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Home() {
  return (
    <PlayerPage>
      <main className="mx-auto max-w-5xl px-4 pb-6 pt-6 sm:py-10">
        <Suspense fallback={<HallsSkeleton />}>
          <Halls />
        </Suspense>
      </main>
    </PlayerPage>
  );
}
