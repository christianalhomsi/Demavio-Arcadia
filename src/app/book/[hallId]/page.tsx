import { Gamepad2, Monitor } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { PlayerPage } from "@/components/player/PlayerPage";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicHall, listPublicDevices } from "@/features/booking/queries";
import { isUuid } from "@/lib/auth/authorize";
import { getT } from "@/lib/i18n/server";

async function Devices({ params }: { params: Promise<{ hallId: string }> }) {
  const { hallId } = await params;
  if (!isUuid(hallId)) notFound();
  const [hall, devices, { t }] = await Promise.all([
    getPublicHall(hallId),
    listPublicDevices(hallId),
    getT(),
  ]);
  if (!hall || !devices) notFound();

  return (
    <>
      <Link href="/" className="text-sm text-accent underline">
        {t.allHalls}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{hall.name}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">{t.chooseDevice}</p>
      {devices.length === 0 ? (
        <EmptyState title={t.noDevices} description={t.noDevicesDesc} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => {
            const Icon = d.deviceType === "pc" ? Monitor : Gamepad2;
            return (
              <li key={d.id}>
                <Link
                  href={`/book/${hall.id}/${d.id}`}
                  className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-card transition-colors hover:bg-neutral-bg"
                >
                  <Icon className="h-6 w-6 text-accent" aria-hidden />
                  <span className="mt-3 text-base font-semibold">{d.name}</span>
                  <span className="mt-1 text-sm text-muted">
                    {d.deviceType === "pc" ? t.pc : t.console}
                    {d.category ? ` · ${d.category}` : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default function HallPage({ params }: { params: Promise<{ hallId: string }> }) {
  return (
    <PlayerPage>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <Devices params={params} />
        </Suspense>
      </main>
    </PlayerPage>
  );
}
