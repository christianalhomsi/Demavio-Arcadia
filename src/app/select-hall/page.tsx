import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerPage } from "@/components/player/PlayerPage";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Select hall" };

async function HallList() {
  const ctx = await requireUser();
  const halls = ctx.memberships;
  if (halls.length === 0) redirect("/no-access");
  const { t } = await getT();

  return (
    <ul className="mt-4 space-y-2">
      {halls.map((h) => (
        <li key={h.hall_id}>
          {h.hall_status === "active" ? (
            <Link
              href={`/halls/${h.hall_id}`}
              className="flex items-center justify-between rounded-2xl border border-border bg-surface shadow-card p-4 hover:bg-neutral-bg"
            >
              <span className="font-medium">{h.hall_name}</span>
              <span className="text-xs text-muted">
                {h.role === "owner" ? t.emRoleOwner : t.emRoleEmployee}
              </span>
            </Link>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-border p-4 opacity-60">
              <span>{h.hall_name}</span>
              <span className="text-xs text-muted">{t.plInactive}</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

async function Heading() {
  const { t } = await getT();
  return <h1 className="text-xl font-semibold">{t.selTitle}</h1>;
}

export default function SelectHallPage() {
  return (
    <PlayerPage header={false}>
      <main className="mx-auto max-w-md px-4 py-16">
        <Suspense fallback={<Skeleton className="mt-4 h-16 w-full" />}>
          <Heading />
          <HallList />
        </Suspense>
      </main>
    </PlayerPage>
  );
}
