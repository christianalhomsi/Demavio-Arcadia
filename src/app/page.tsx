import { Gamepad2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { PlayerPage } from "@/components/player/PlayerPage";
import { Skeleton } from "@/components/ui/skeleton";
import { listPublicHalls } from "@/features/booking/queries";
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
  return (
    <>
      <h1 className="text-2xl font-semibold">{t.homeTitle}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">{t.homeSub}</p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {halls.map((h) => (
          <li key={h.id}>
            <Link
              href={`/book/${h.id}`}
              className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-card transition-colors hover:bg-neutral-bg"
            >
              <Gamepad2 className="h-6 w-6 text-accent" aria-hidden />
              <span className="mt-3 text-base font-semibold">{h.name}</span>
              <span className="mt-1 text-sm text-muted">
                {h.deviceCount} {h.deviceCount === 1 ? t.deviceOne : t.deviceMany}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Home() {
  return (
    <PlayerPage>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Suspense fallback={<Skeleton className="h-32 w-full" />}>
          <Halls />
        </Suspense>
      </main>
    </PlayerPage>
  );
}
