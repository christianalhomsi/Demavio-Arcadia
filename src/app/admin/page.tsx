import Link from "next/link";
import { ChevronRight, Plus, UserPlus } from "lucide-react";
import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlatformMetrics } from "@/features/admin/queries";
import { requirePlatformRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Administration" };

function Stat({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: number | string;
  note?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group block min-h-24 rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-primary active:bg-neutral-bg"
    >
      <dt className="flex items-center justify-between text-sm text-muted">
        {label}
        <ChevronRight
          className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100 rtl:-scale-x-100"
          aria-hidden
        />
      </dt>
      <dd className="mt-1 text-3xl font-semibold tabular-nums">{value}</dd>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </Link>
  );
}

function Quick({ href, icon: Icon, label }: { href: string; icon: typeof Plus; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface px-4 text-sm font-medium transition-colors hover:border-primary active:bg-neutral-bg"
    >
      <Icon className="h-5 w-5 text-accent" aria-hidden />
      {label}
    </Link>
  );
}

async function AdminHome() {
  await requirePlatformRole("super_admin");
  const m = await getPlatformMetrics();
  const { t } = await getT();
  if (!m) return <ErrorState message={t.plLoadFail} />;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{t.plHomeTitle}</h1>

      <section aria-labelledby="quick-h" className="space-y-2">
        <h2 id="quick-h" className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t.plQuickTitle}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Quick href="/admin/halls" icon={Plus} label={t.plQuickCustomer} />
          <Quick href="/admin/sales" icon={UserPlus} label={t.plQuickSales} />
        </div>
      </section>

      <section aria-labelledby="glance-h" className="space-y-2">
        <h2 id="glance-h" className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t.plOverviewTitle}
        </h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label={t.plStatHalls} value={m.hallsTotal} href="/admin/halls" />
          <Stat label={t.plStatUsers} value={m.usersTotal} href="/admin/users" />
          <Stat
            label={t.plStatAgents}
            value={`${m.agentsRecent}/${m.agentsTotal}`}
            note={t.plStatHeartbeat}
            href="/admin/monitoring"
          />
        </dl>
      </section>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <AdminHome />
    </Suspense>
  );
}
