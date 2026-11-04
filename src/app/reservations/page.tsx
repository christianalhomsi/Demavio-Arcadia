import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { PlayerPage } from "@/components/player/PlayerPage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MyBookings } from "@/features/booking/components/MyBookings";
import { listMyReservations } from "@/features/booking/queries";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "My bookings" };

async function Bookings() {
  // Anonymous visitors are redirected to /login by the proxy; this also rejects inactive accounts.
  await requireUser();
  const { t } = await getT();
  const rows = await listMyReservations();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">{t.myBookings}</h1>
      {!rows ? (
        <EmptyState title={t.bookingsUnavailable} description={t.hallsUnavailableDesc} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t.noBookings}
          description={t.noBookingsDesc}
          action={
            <Button asChild>
              <Link href="/">{t.bookDevice}</Link>
            </Button>
          }
        />
      ) : (
        <MyBookings reservations={rows} />
      )}
    </>
  );
}

export default function ReservationsPage() {
  return (
    <PlayerPage next="/reservations">
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <Bookings />
        </Suspense>
      </main>
    </PlayerPage>
  );
}
