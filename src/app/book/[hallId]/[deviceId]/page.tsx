import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerPage } from "@/components/player/PlayerPage";
import { getT } from "@/lib/i18n/server";
import { isUuid } from "@/lib/auth/authorize";
import { getMyContext } from "@/lib/auth/session";
import { dayWindow, parseDateParam, todayInZone } from "@/lib/dayWindow";
import { BookingPicker } from "@/features/booking/components/BookingPicker";
import { getPublicHall, listDeviceBusy, listPublicDevices } from "@/features/booking/queries";

type Params = Promise<{ hallId: string; deviceId: string }>;
type Search = Promise<{ date?: string; start?: string; end?: string; players?: string }>;

async function Booking({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ hallId, deviceId }, sp] = await Promise.all([params, searchParams]);
  if (!isUuid(hallId) || !isUuid(deviceId)) notFound();

  const [hall, devices] = await Promise.all([getPublicHall(hallId), listPublicDevices(hallId)]);
  const device = devices?.find((d) => d.id === deviceId);
  if (!hall || !device) notFound();

  const now = new Date();
  const today = todayInZone(hall.timeZone, now);
  const requested = parseDateParam(sp.date, hall.timeZone, now);
  const date = requested < today ? today : requested;

  // Bookings may run past midnight, so look a little beyond the end of the chosen day.
  const win = dayWindow(date, hall.timeZone);
  const busy = await listDeviceBusy(
    deviceId,
    win.start,
    new Date(win.end.getTime() + 4 * 3_600_000),
  );
  if (!busy) notFound();

  const ctx = await getMyContext();
  const { t } = await getT();
  const valid = (v?: string) => (v && !Number.isNaN(Date.parse(v)) ? v : undefined);
  const players = Number(sp.players);

  return (
    <>
      <Link
        href={`/book/${hall.id}`}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4 ltr:rotate-180" aria-hidden />
        {hall.name}
      </Link>
      <h1 className="text-2xl font-semibold">{device.name}</h1>
      <p className="mt-1 text-xs text-muted">
        {t.timesIn} {hall.timeZone}
      </p>
      <BookingPicker
        // Remount when the day changes so the picked slot and month view follow the URL.
        key={date}
        deviceId={device.id}
        hallName={hall.name}
        deviceName={device.name}
        timeZone={hall.timeZone}
        currency={hall.currency}
        date={date}
        today={today}
        nowMs={now.getTime()}
        hours={hall.hours}
        busy={busy}
        signedIn={Boolean(ctx && ctx.profile.status === "active")}
        playerOptions={device.playerOptions}
        initialStart={valid(sp.start)}
        initialEnd={valid(sp.end)}
        initialPlayers={Number.isFinite(players) ? players : undefined}
      />
    </>
  );
}

export default function DeviceBookingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  return (
    <PlayerPage>
      <main className="mx-auto max-w-5xl px-4 pb-8 pt-4 sm:py-8">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <Booking params={params} searchParams={searchParams} />
        </Suspense>
      </main>
    </PlayerPage>
  );
}
