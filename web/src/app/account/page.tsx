import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/Brand";
import { LocaleFrame } from "@/components/i18n/LocaleFrame";
import { LanguageToggle } from "@/components/player/LanguageToggle";
import { FormSkeleton } from "@/components/ui/skeleton";
import { isStaff, resolveLanding } from "@/lib/auth/context";
import { getMyContext } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { AccountForms } from "./AccountForms";

export const metadata = { title: "My account" };

async function Account() {
  const ctx = await getMyContext();
  if (!ctx) redirect("/login?next=/account");
  if (ctx.profile.status !== "active") redirect("/no-access?reason=inactive");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const hasPassword = (data.user?.identities ?? []).some((i) => i.provider === "email");
  const { t } = await getT();
  const back = isStaff(ctx) ? resolveLanding(ctx) : "/";
  return (
    <LocaleFrame>
      <header className="flex h-14 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
        <Link
          href={back}
          aria-label={t.acBack}
          className="grid h-10 w-10 place-items-center rounded-xl hover:bg-neutral-bg"
        >
          <ArrowLeft className="h-5 w-5 rtl:-scale-x-100" aria-hidden />
        </Link>
        <Logo size={32} />
        <span className="flex-1 truncate font-semibold">{t.acTitle}</span>
        <LanguageToggle />
      </header>
      <main className="mx-auto w-full max-w-md space-y-6 px-4 py-6">
        <p className="text-sm text-muted">{t.acDesc}</p>
        <AccountForms
          email={ctx.profile.email ?? ""}
          username={ctx.profile.username ?? ""}
          displayName={ctx.profile.display_name ?? ""}
          hasPassword={hasPassword}
        />
      </main>
    </LocaleFrame>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<FormSkeleton fields={3} />}>
      <Account />
    </Suspense>
  );
}
