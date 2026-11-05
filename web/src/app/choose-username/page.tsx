import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LanguageToggle } from "@/components/player/LanguageToggle";
import { Logo, Wordmark } from "@/components/player/PlayerHeader";
import { PlayerPage } from "@/components/player/PlayerPage";
import { FormSkeleton } from "@/components/ui/skeleton";
import { destinationAfterChoosing, needsUsername } from "@/lib/auth/context";
import { getMyContext } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/redirect";
import { getT } from "@/lib/i18n/server";
import { UsernameForm } from "./UsernameForm";

export const metadata = { title: "Choose a username" };

async function Choose({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const ctx = await getMyContext();
  if (!ctx) redirect("/login");
  if (ctx.profile.status !== "active") redirect("/no-access?reason=inactive");
  const target = safeNext(next, "/");
  if (!needsUsername(ctx)) redirect(destinationAfterChoosing(ctx, target));
  const { t } = await getT();
  return (
    <>
      <h2 className="text-xl font-semibold">{t.cuTitle}</h2>
      <p className="mt-1 mb-4 text-sm text-muted">{t.cuDesc}</p>
      <UsernameForm next={target} />
    </>
  );
}

export default function ChooseUsernamePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <PlayerPage header={false}>
      <main className="mx-auto max-w-md px-4 py-12">
        <div className="mb-4 flex justify-end">
          <LanguageToggle />
        </div>
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="rounded-3xl border border-border bg-surface p-3 shadow-card">
            <Logo size={104} className="rounded-2xl" />
          </div>
          <h1 className="mt-4 text-4xl">
            <Wordmark />
          </h1>
        </div>
        <Suspense fallback={<FormSkeleton fields={1} />}>
          <Choose searchParams={searchParams} />
        </Suspense>
      </main>
    </PlayerPage>
  );
}
