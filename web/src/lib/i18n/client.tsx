"use client";

import * as React from "react";
import { messages, type Locale, type Messages } from "./messages";

const Ctx = React.createContext<{ locale: Locale; t: Messages }>({
  locale: "en",
  t: messages.en,
});

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ locale, t: messages[locale] }), [locale]);
  // Dialogs and menus render in a portal outside the locale wrapper, so the page root must carry the
  // language too: that is what gives them the Arabic font and right-to-left direction.
  React.useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => React.useContext(Ctx);
