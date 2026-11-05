import { Suspense } from "react";
import { I18nProvider } from "@/lib/i18n/client";
import { getT } from "@/lib/i18n/server";
import { PlayerHeader } from "./PlayerHeader";

async function Frame({
  children,
  next,
  header,
}: {
  children: React.ReactNode;
  next?: string;
  header: boolean;
}) {
  const { locale, t } = await getT();
  return (
    <I18nProvider locale={locale}>
      <div
        dir={locale === "ar" ? "rtl" : "ltr"}
        lang={locale}
        data-locale={locale}
        // Room for the phone tab bar (pill bar + gap + safe area) so it never covers the last content.
        className={`stars min-h-screen ${header ? "pb-[calc(6.5rem+var(--safe-bottom))] md:pb-0" : ""}`}
      >
        {header && <PlayerHeader next={next} t={t} />}
        {children}
      </div>
    </I18nProvider>
  );
}

/**
 * Shell for the public pages (home, booking, login): language + direction from the visitor's cookie,
 * the starfield background, and optionally the header. Staff pages never use it and stay English.
 */
export function PlayerPage({
  children,
  next,
  header = true,
}: {
  children: React.ReactNode;
  next?: string;
  header?: boolean;
}) {
  return (
    <Suspense fallback={<div className="stars min-h-screen" />}>
      <Frame next={next} header={header}>
        {children}
      </Frame>
    </Suspense>
  );
}
