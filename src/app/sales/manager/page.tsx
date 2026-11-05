import { Suspense } from "react";
import { EmptyState } from "@/components/data/EmptyState";
import { ErrorState } from "@/components/data/ErrorState";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { getMyManager } from "@/features/sales/queries";
import { requirePlatformRole } from "@/lib/auth/guards";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Manager" };

async function Manager() {
  await requirePlatformRole("sales_agent");
  const manager = await getMyManager();
  const { t } = await getT();
  if (manager === undefined) return <ErrorState message={t.slLoadFail} />;
  const name = manager?.displayName ?? manager?.email ?? "";
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t.slManagerTitle}</h1>
        <p className="mt-1 text-sm text-muted">{t.slManagerIntro}</p>
      </div>
      {manager ? (
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 shadow-card">
          <span
            aria-hidden
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary/15 text-xl font-semibold text-accent"
          >
            {name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{name}</p>
            {manager.email && (
              <a href={`mailto:${manager.email}`} className="block truncate text-sm text-accent">
                <bdi>{manager.email}</bdi>
              </a>
            )}
            {manager.username && (
              <p className="truncate text-sm text-muted">
                <bdi>@{manager.username}</bdi>
              </p>
            )}
          </div>
        </div>
      ) : (
        <EmptyState title={t.slManagerNone} description={t.slManagerNoneDesc} />
      )}
    </div>
  );
}

export default function SalesManagerPage() {
  return (
    <Suspense fallback={<ListPageSkeleton subtitle rows={1} />}>
      <Manager />
    </Suspense>
  );
}
