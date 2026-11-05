import Link from "next/link";
import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { permissionForPath } from "@/components/shell/nav";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { listDeviceStatus } from "@/features/devices/queries";
import { getHallSettingsBundle } from "@/features/halls/queries";
import { DayCalendar } from "@/features/reservations/components/DayCalendar";
import { ReservationsPanel } from "@/features/reservations/components/ReservationsPanel";
import { listReservations } from "@/features/reservations/queries";
import { getServerNow, listSessions } from "@/features/sessions/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";
import { dayWindow, parseDateParam, shiftDate } from "@/lib/dayWindow";
import { LiveRefresh } from "@/lib/realtime/LiveRefresh";

export const metadata = { title: "Reservations" };

async function Reservations({
  params,
  searchParams,
}: {
  params: Promise<{ hallId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { hallId } = await params;
  const { membership } = await requireHallPermission(hallId, permissionForPath("/reservations"));

  const { t } = await getT();
  const bundle = await getHallSettingsBundle(hallId);
  if (!bundle) return <ErrorState message={t.rsSettingsFail} />;
  const tz = bundle.hall.timeZone;

  const raw = (await searchParams).date;
  const date = parseDateParam(Array.isArray(raw) ? raw[0] : raw, tz);
  const window = dayWindow(date, tz);

  const canSeeSessions = membership.permissions.includes("session.start");
  const [reservations, devices, sessions, serverNow] = await Promise.all([
    listReservations(hallId, window.start, window.end),
    listDeviceStatus(hallId),
    canSeeSessions
      ? listSessions(hallId, { activeOnly: false, limit: 100, offset: 0 })
      : Promise.resolve({ rows: [], total: 0 }),
    getServerNow(),
  ]);
  if (!reservations || !devices || !sessions) return <ErrorState message={t.rsLoadFail} />;

  const daySessions = sessions.rows.filter(
    (s) =>
      Date.parse(s.startedAt) < window.end.getTime() &&
      Date.parse(s.endedAt ?? s.scheduledEndAt ?? serverNow) > window.start.getTime(),
  );
  const active = devices.filter((d) => d.operationalStatus === "active");

  return (
    <div className="space-y-6">
      <LiveRefresh hallId={hallId} tables={["reservations", "sessions"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.rsTitle}</h1>
        <nav
          aria-label={t.rsDay}
          className="grid w-full grid-cols-3 items-center gap-2 text-sm sm:flex sm:w-auto"
        >
          <Link
            className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full border border-border px-3 py-1 sm:min-h-10 sm:px-4"
            href={`?date=${shiftDate(date, -1)}`}
          >
            {t.rsPrevDay}
          </Link>
          <span className="order-first col-span-3 text-center font-medium tabular-nums sm:order-none sm:col-span-1">
            {date}
          </span>
          <Link
            className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full border border-border px-3 py-1 sm:min-h-10 sm:px-4"
            href="?"
          >
            {t.rsToday}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full border border-border px-3 py-1 sm:min-h-10 sm:px-4"
            href={`?date=${shiftDate(date, 1)}`}
          >
            {t.rsNextDay}
          </Link>
        </nav>
      </div>

      <DayCalendar
        hallId={hallId}
        timeZone={tz}
        window={window}
        devices={active.map((d) => ({ id: d.deviceId, name: d.name }))}
        reservations={reservations}
        sessions={daySessions}
      />

      <ReservationsPanel
        hallId={hallId}
        timeZone={tz}
        graceMinutes={bundle.settings.checkinGraceMinutes}
        reservations={reservations}
        devices={active.map((d) => ({ id: d.deviceId, name: d.name }))}
        serverNow={serverNow}
      />
    </div>
  );
}

export default function ReservationsPage({
  params,
  searchParams,
}: PageProps<"/halls/[hallId]/reservations">) {
  return (
    <Suspense fallback={<ListPageSkeleton rows={6} />}>
      <Reservations params={params} searchParams={searchParams} />
    </Suspense>
  );
}
