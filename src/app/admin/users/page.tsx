import {
  Building2,
  Crown,
  Gamepad2,
  Handshake,
  HardHat,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ErrorState } from "@/components/data/ErrorState";
import { Pagination } from "@/components/data/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { AssignRoleButton, UsersList } from "@/features/admin/components/AdminPanels";
import { getUserRoleCounts, listPlatformUsers } from "@/features/admin/queries";
import { requirePlatformRole } from "@/lib/auth/guards";
import { cn } from "@/lib/cn";
import type { Messages } from "@/lib/i18n/messages";
import { parseListParams, toRange } from "@/lib/query/searchParams";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Users" };

/** One tab per platform role, plus everyone and people without a platform role. */
const TABS = [
  { key: "all", icon: UsersRound, label: "plUsTabAll", desc: "plUsNote" },
  { key: "super_admin", icon: Crown, label: "roleSuper", desc: "plRoleDescSuper" },
  { key: "sales_admin", icon: ShieldCheck, label: "roleSalesAdmin", desc: "plRoleDescSalesAdmin" },
  { key: "sales_agent", icon: Handshake, label: "roleSalesAgent", desc: "plRoleDescSalesAgent" },
  { key: "hall_owner", icon: Building2, label: "roleHallOwner", desc: "plRoleDescHallOwner" },
  {
    key: "hall_employee",
    icon: HardHat,
    label: "roleHallEmployee",
    desc: "plRoleDescHallEmployee",
  },
  { key: "player", icon: Gamepad2, label: "rolePlayer", desc: "plRoleDescPlayer" },
] as const satisfies readonly {
  key: string;
  icon: unknown;
  label: keyof Messages;
  desc: keyof Messages;
}[];

async function Users({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformRole("super_admin");
  const sp = await searchParams;
  const list = parseListParams(sp, { pageSize: 25 });
  const tab = TABS.find((x) => x.key === sp.role) ?? TABS[0];
  const [from] = toRange(list);
  const [result, counts] = await Promise.all([
    listPlatformUsers({
      search: list.q,
      role: tab.key === "all" ? undefined : tab.key,
      limit: list.pageSize,
      offset: from,
    }),
    getUserRoleCounts(),
  ]);
  const { t } = await getT();
  if (!result) return <ErrorState message={t.plUsLoadFail} />;
  const href = (key: string) => {
    const qs = new URLSearchParams();
    if (key !== "all") qs.set("role", key);
    if (list.q) qs.set("q", list.q);
    const s = qs.toString();
    return s ? `?${s}` : "?";
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.plUsTitle}</h1>
        <AssignRoleButton canManageAll />
      </div>

      {/* One scrollable row on phones; each role has its own tab with its head count. */}
      <nav
        aria-label={t.plUsTitle}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((x) => {
          const on = x.key === tab.key;
          const Icon = x.icon;
          return (
            <Link
              key={x.key}
              href={href(x.key)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                on
                  ? "border-primary/60 bg-primary/20 text-foreground"
                  : "border-border bg-surface text-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t[x.label]}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs tabular-nums",
                  on ? "bg-primary/30" : "bg-neutral-bg text-muted",
                )}
              >
                {counts?.[x.key] ?? "–"}
              </span>
            </Link>
          );
        })}
      </nav>

      <p className="text-sm text-muted">{t[tab.desc]}</p>

      <form method="get" role="search" className="flex gap-2">
        {tab.key !== "all" && <input type="hidden" name="role" value={tab.key} />}
        <label htmlFor="uq" className="sr-only">
          {t.plUsSearch}
        </label>
        <input
          id="uq"
          name="q"
          defaultValue={list.q}
          placeholder={t.plUsPlaceholder}
          className="h-11 w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 text-base sm:h-10 sm:text-sm"
        />
        <button className="h-11 rounded-xl border border-border bg-surface px-4 text-sm font-medium sm:h-10">
          {t.plSrBtn}
        </button>
      </form>
      <UsersList users={result.rows} timeZone="UTC" canManageAll />
      <Suspense fallback={null}>
        <Pagination page={list.page} pageSize={list.pageSize} total={result.total} />
      </Suspense>
    </div>
  );
}

export default function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <Users searchParams={searchParams} />
    </Suspense>
  );
}
