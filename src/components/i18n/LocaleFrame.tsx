import { I18nProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";

/**
 * Applies the visitor's language and writing direction to a subtree and provides the dictionary to its
 * client components. Reads a cookie, so render it inside a Suspense boundary (layouts already do).
 */
export async function LocaleFrame({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale}>
      <div dir={locale === "ar" ? "rtl" : "ltr"} lang={locale} data-locale={locale}>
        {children}
      </div>
    </I18nProvider>
  );
}
