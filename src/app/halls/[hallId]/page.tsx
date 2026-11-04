import { connection } from "next/server";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Circle,
  Gamepad2,
  Package,
  ReceiptText,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { permissionForPath } from "@/components/shell/nav";
import { Badge, type Tone } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Permission } from "@/contracts/permissions";
import { listDeviceStatus, type Availability } from "@/features/devices/queries";
import { getHallSettingsBundle, getHallTimeZone } from "@/features/halls/queries";
import { listInvoices } from "@/features/invoices/queries";
import { listReservations, type ReservationRow } from "@/features/reservations/queries";
import { listSessions } from "@/features/sessions/queries";
import { listRegisters } from "@/features/shifts/queries";
import { requireHallPermission } from "@/lib/auth/guards";
import { cn } from "@/lib/cn";
import { getT } from "@/lib/i18n/server";
import { formatLocale, tpl, type Messages } from "@/lib/i18n/messages";

export const metadata = { title: "Overview" };

const STATUS_KEY: Record<ReservationRow["status"], keyof Messages> = {
  pending: "statusPending",
  confirmed: "statusConfirmed",
  checked_in: "statusCheckedIn",
  canceled: "statusCanceled",
  no_show: "statusNoShow",
};
const STATUS_TONE: Record<ReservationRow["status"], Tone> = {
  pending: "warning",
  confirmed: "info",
  checked_in: "success",
  canceled: "neutral",
  no_show: "warning",
};
const AVAILABILITY_KEY: Record<Availability, keyof Messages> = {
  available: "statusAvailable",
  in_use: "statusInUse",
  maintenance: "statusMaintenance",
  disabled: "statusDisabled",
};
const AVAILABILITY_TONE: Record<Availability, Tone> = {
  available: "success",
  in_use: "info",
  maintenance: "warning",
  disabled: "neutral",
};

/** Shortcuts to the pages the phone tab bar does not carry; each shows only for people who may open it. */
const QUICK: { path: string; permission: Permission; label: keyof Messages; icon: LucideIcon }[] = [
  { path: "/invoices", permission: "invoice.view", label: "navInvoices", icon: ReceiptText },
  {
    path: "/reservations",
    permission: "reservation.view",
    label: "navReservations",
    icon: CalendarClock,
  },
  { path: "/products", permission: "product.sell", label: "navProducts", icon: Package },
  { path: "/wallets", permission: "wallet.view", label: "navWallets", icon: Wallet },
  { path: "/devices", permission: "device.view", label: "navDevices", icon: Gamepad2 },
];

async function Overview({ params }: { params: Promise<{ hallId: string }> }) {
  // The overview shows the current time, so it is always rendered per request.
  await connection();
  const { hallId } = await params;
  const { membership } = await requireHallPermission(hallId, permissionForPath(""));
  const { t, locale } = await getT();
  const perms = membership.permissions;
  const canManage = perms.includes("hall.settings.manage");
  const base = `/halls/${hallId}`;

  // Each block is fetched only if the person may see it; the database enforces the same rule.
  const now = new Date();
  const [bundle, outstanding, devices, activeSessions, registers, upcoming, timeZone] =
    await Promise.all([
      // Only owners see the setup checklist; it reads settings the employee role cannot manage.
      canManage ? getHallSettingsBundle(hallId) : null,
      // A count only: money totals are never summed in the browser.
      perms.includes("invoice.view")
        ? listInvoices(hallId, { limit: 1, offset: 0, outstandingOnly: true })
        : null,
      perms.includes("device.view") ? listDeviceStatus(hallId) : null,
      perms.includes("session.start")
        ? listSessions(hallId, { activeOnly: true, limit: 1, offset: 0 })
        : null,
      perms.includes("shift.open") || perms.includes("shift.close") ? listRegisters(hallId) : null,
      perms.includes("reservation.view")
        ? listReservations(hallId, now, new Date(now.getTime() + 7 * 86_400_000))
        : null,
      getHallTimeZone(hallId),
    ]);
  // Counts of rows the database returned: display only.
  const count = (a: string) => devices?.filter((d) => d.effectiveAvailability === a).length ?? 0;
  const offlineAgents = devices?.filter((d) => d.agentStatus === "offline").length ?? 0;
  const openShift = registers?.find((r) => r.openShiftId) ?? null;
  const pending = upcoming?.filter((r) => r.status === "pending").length ?? 0;
  const next = (upcoming ?? [])
    .filter((r) => r.status === "pending" || r.status === "confirmed")
    .slice(0, 5);
  const quick = QUICK.filter((q) => perms.includes(q.permission));
  const when = new Intl.DateTimeFormat(formatLocale(locale), {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  // What needs a person right now, most important first. Nothing here when everything is fine.
  const attention: { text: string; href: string }[] = [];
  if (upcoming && perms.includes("reservation.confirm") && pending > 0)
    attention.push({ text: tpl(t.ovAttnPending, { n: pending }), href: `${base}/reservations` });
  if (outstanding && outstanding.total > 0)
    attention.push({
      text: tpl(t.ovAttnUnpaid, { n: outstanding.total }),
      href: `${base}/invoices?show=outstanding`,
    });
  if (devices && offlineAgents > 0)
    attention.push({ text: tpl(t.ovAttnOffline, { n: offlineAgents }), href: `${base}/agents` });
  if (registers && !openShift) attention.push({ text: t.ovAttnShift, href: `${base}/shifts` });

  // The setup checklist only exists until the owner has finished it.
  const setup = bundle
    ? [
        { done: bundle.hours.length > 0, label: t.ovSetupHours },
        { done: Boolean(bundle.hall.address), label: t.ovSetupAddress },
      ]
    : [];
  const setupOpen = setup.some((s) => !s.done);
  const hasLive = Boolean(devices) || Boolean(activeSessions);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{membership.hall_name}</h1>
        <p className="mt-0.5 text-sm text-muted">{t.ovSubtitle}</p>
      </header>

      {(devices || registers || upcoming || outstanding) && (
        <section aria-labelledby="attn-h" className="space-y-2">
          <h2 id="attn-h" className="text-sm font-semibold text-accent">
            {t.ovAttention}
          </h2>
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-4 text-sm shadow-card">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
              {t.ovAllGood}
            </p>
          ) : (
            <ul className="space-y-2">
              {attention.map((a) => (
                <li key={a.href + a.text}>
                  <Link
                    href={a.href}
                    className="flex min-h-14 items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm font-medium transition-colors hover:bg-warning/15 active:bg-warning/20"
                  >
                    <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden />
                    <span className="min-w-0 flex-1">{a.text}</span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted rtl:rotate-180"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {setupOpen && (
        <section
          aria-labelledby="setup-h"
          className="rounded-2xl border border-border bg-surface p-4 shadow-card"
        >
          <h2 id="setup-h" className="mb-3 font-medium">
            {t.ovSetup}
          </h2>
          <ul className="space-y-1 text-sm">
            {setup.map((s) => (
              <Step key={s.label} done={s.done} href={`${base}/settings`} t={t}>
                {s.label}
              </Step>
            ))}
          </ul>
        </section>
      )}

      {hasLive && (
        <section aria-labelledby="live-h" className="space-y-2">
          <h2 id="live-h" className="text-sm font-semibold text-accent">
            {t.ovLive}
          </h2>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {devices && (
              <>
                <Kpi label={t.ovAvailable} value={count("available")} href={`${base}/devices`} />
                <Kpi label={t.ovInUse} value={count("in_use")} href={`${base}/devices`} />
                <Kpi
                  label={t.ovMaintenance}
                  value={count("maintenance")}
                  href={`${base}/devices`}
                />
              </>
            )}
            {activeSessions && (
              <Kpi
                label={t.ovActiveSessions}
                value={activeSessions.total}
                href={`${base}/sessions`}
              />
            )}
          </dl>
        </section>
      )}

      {registers && (
        <Link
          href={openShift ? `${base}/shifts/${openShift.openShiftId}` : `${base}/shifts`}
          className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors hover:bg-neutral-bg active:bg-neutral-bg"
        >
          <span className="text-sm text-muted">{t.ovCashShift}</span>
          <Badge tone={openShift ? "success" : "neutral"}>
            {openShift ? t.ovShiftOpen : t.ovShiftClosed}
          </Badge>
        </Link>
      )}

      {devices && devices.length > 0 && (
        <section aria-labelledby="dev-h">
          <h2 id="dev-h" className="mb-2 text-sm font-semibold text-accent">
            {t.ovDevices}
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {devices.slice(0, 12).map((d) => (
              <li key={d.deviceId}>
                <Link
                  href={`${base}/devices/${d.deviceId}`}
                  className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-card transition-colors hover:bg-neutral-bg active:bg-neutral-bg"
                >
                  <span className="truncate text-sm font-semibold">{d.name}</span>
                  <Badge tone={AVAILABILITY_TONE[d.effectiveAvailability]}>
                    {t[AVAILABILITY_KEY[d.effectiveAvailability]]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {upcoming && (
        <section aria-labelledby="up-h">
          <h2 id="up-h" className="mb-2 text-sm font-semibold text-accent">
            {t.ovUpcoming}
          </h2>
          {next.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
              {t.ovNoUpcoming}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
              {next.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.deviceName}</span>
                    <span className="tabular-nums text-muted">
                      {when.format(new Date(r.startAt))} – {when.format(new Date(r.endAt))}
                    </span>
                  </span>
                  <Badge tone={STATUS_TONE[r.status]}>{t[STATUS_KEY[r.status]]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {quick.length > 0 && (
        <section aria-labelledby="quick-h">
          <h2 id="quick-h" className="mb-2 text-sm font-semibold text-accent">
            {t.ovQuick}
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {quick.map((q) => (
              <li key={q.path}>
                <Link
                  href={`${base}${q.path}`}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface px-3 shadow-card transition-colors hover:bg-neutral-bg active:bg-neutral-bg"
                >
                  <q.icon className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                  <span className="text-sm font-medium">{t[q.label]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors",
        "hover:bg-neutral-bg active:bg-neutral-bg",
      )}
    >
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums">{value}</dd>
    </Link>
  );
}

function Step({
  done,
  href,
  t,
  children,
}: {
  done: boolean;
  href: string;
  t: Messages;
  children: React.ReactNode;
}) {
  const Icon = done ? CheckCircle2 : Circle;
  return (
    <li className="flex min-h-11 items-center gap-2">
      <Icon className={done ? "h-4 w-4 text-success" : "h-4 w-4 text-muted"} aria-hidden />
      <span className="sr-only">{done ? t.ovDone : t.ovTodo}</span>
      {done ? (
        <span className="text-muted line-through">{children}</span>
      ) : (
        <Link href={href} className="flex min-h-11 flex-1 items-center underline">
          {children}
        </Link>
      )}
    </li>
  );
}

export default function HallOverviewPage({ params }: PageProps<"/halls/[hallId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-24" />}>
      <Overview params={params} />
    </Suspense>
  );
}
