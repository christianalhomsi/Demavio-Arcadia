import { Suspense } from "react";
import { PlayerPage } from "@/components/player/PlayerPage";
import { getT } from "@/lib/i18n/server";
import { AcceptInvitation } from "./AcceptInvitation";

export const metadata = { title: "Accept invitation", robots: { index: false, follow: false } };

async function Content({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t } = await getT();
  return (
    <>
      <h1 className="text-xl font-semibold">{t.invTitle}</h1>
      <AcceptInvitation token={token} />
    </>
  );
}

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <PlayerPage header={false}>
      <main className="mx-auto max-w-sm px-4 py-24 text-center">
        <Suspense fallback={null}>
          <Content params={params} />
        </Suspense>
      </main>
    </PlayerPage>
  );
}
