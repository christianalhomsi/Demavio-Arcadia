import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { PlayerPage } from "@/components/player/PlayerPage";
import { getMyContext } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "No access" };

async function Details({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const ctx = await getMyContext();
  const { t } = await getT();
  const inactive = reason === "inactive";

  return (
    <>
      <h1 className="text-xl font-semibold">{inactive ? t.naDeactTitle : t.naNoTitle}</h1>
      <p className="mt-2 text-sm text-muted">{inactive ? t.naDeactMsg : t.naNoMsg}</p>
      {ctx?.profile.email && <p className="mt-2 text-xs text-muted">{ctx.profile.email}</p>}
    </>
  );
}

async function SignOut() {
  const { t } = await getT();
  return (
    <form action="/auth/signout" method="post" className="mt-6">
      <Button variant="secondary" type="submit">
        {t.signOut}
      </Button>
    </form>
  );
}

export default function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  return (
    <PlayerPage header={false}>
      <main className="mx-auto max-w-md py-24 text-center">
        <Suspense fallback={<p className="text-sm text-muted">…</p>}>
          <Details searchParams={searchParams} />
          <SignOut />
        </Suspense>
      </main>
    </PlayerPage>
  );
}
