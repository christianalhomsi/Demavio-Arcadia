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
      <Skeleton className="h-9 w-3/4 rounded-xl" />
      <Skeleton className="mt-3 h-5 w-2/3" />
      <div className="mt-4 flex gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 rounded-3xl" />
        ))}
      </div>
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
