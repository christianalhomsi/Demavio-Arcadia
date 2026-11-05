"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { setLocaleAction } from "@/lib/i18n/setLocale";

/** Switches between Arabic and English; the label names the language you will switch to. */
export function LanguageToggle() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-label={t.langName}
      className="h-10 w-10 gap-1.5 rounded-full px-0 text-muted hover:text-foreground sm:w-auto sm:px-3.5"
      pending={pending}
      lang={locale === "ar" ? "en" : "ar"}
      onClick={() =>
        start(async () => {
          await setLocaleAction(locale === "ar" ? "en" : "ar");
          router.refresh();
        })
      }
    >
      <Globe className="h-[18px] w-[18px]" aria-hidden />
      <span className="hidden sm:inline">{t.langName}</span>
    </Button>
  );
}
