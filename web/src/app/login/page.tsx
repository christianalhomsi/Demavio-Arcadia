import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LanguageToggle } from "@/components/player/LanguageToggle";
import { Logo, Wordmark } from "@/components/player/PlayerHeader";
import { PlayerPage } from "@/components/player/PlayerPage";
import { FormSkeleton } from "@/components/ui/skeleton";
import { postLoginDestination } from "@/lib/auth/context";
import { safeNext } from "@/lib/auth/redirect";
import { getMyContext } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { AuthForm } from "./AuthForm";

export const metadata = { title: "Sign in" };

type Search = Promise<{ next?: string; error?: string }>;

async function LoginForm({ searchParams }: { searchParams: Search }) {
  const { next, error } = await searchParams;
  const { t } = await getT();

  const ctx = await getMyContext();
  if (ctx && ctx.profile.status === "active") redirect(postLoginDestination(ctx, next));

  const messages: Record<string, string> = {
    cancelled: t.loginCancelled,
    failed: t.loginFailed,
    inactive: t.loginInactive,
  };
  const message = error ? messages[error] : undefined;

  return (
    <>
      {message && (
        <p role="alert" className="mb-3 rounded-xl bg-danger-bg p-3 text-sm text-danger">
          {message}
        </p>
      )}
      <AuthForm next={safeNext(next)} />
    </>
  );
}

async function Heading() {
  const { t } = await getT();
  return <p className="text-xs text-muted">{t.tagline}</p>;
}

/** Wide screens: the brand lives beside the form, so the form never has to scroll into view. */
async function BrandPanel() {
  const { t } = await getT();
  return (
    <aside className="hidden flex-col items-start gap-4 md:flex">
      <Logo size={96} className="rounded-3xl border border-border shadow-card" />
      <div>
        <h1 className="text-5xl leading-tight">
          <Wordmark />
        </h1>
        <p className="mt-1 text-base text-muted">{t.tagline}</p>
      </div>
    </aside>
  );
}

export default function LoginPage({ searchParams }: { searchParams: Search }) {
  return (
    <PlayerPage header={false}>
      <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-2 pb-[calc(0.5rem+var(--safe-bottom))] md:grid md:max-w-4xl md:grid-cols-2 md:items-center md:gap-12 md:px-8">
        <div className="md:absolute md:end-6 md:top-4">
          <div className="hidden md:block">
            <LanguageToggle />
          </div>
        </div>
        <Suspense fallback={null}>
          <BrandPanel />
        </Suspense>
        <div className="w-full">
          <header className="mb-3 flex items-center justify-between gap-3 md:hidden">
            <div className="flex items-center gap-3">
              <Logo size={44} className="rounded-xl border border-border" />
              <div className="leading-tight">
                <h1 className="text-2xl">
                  <Wordmark />
                </h1>
                <Suspense fallback={<div className="h-4 w-20" />}>
                  <Heading />
                </Suspense>
              </div>
            </div>
            <LanguageToggle />
          </header>
          <Suspense fallback={<FormSkeleton fields={2} />}>
            <LoginForm searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
    </PlayerPage>
  );
}
