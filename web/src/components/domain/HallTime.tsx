"use client";

import { formatHallTime, formatHallTimeWithZone } from "@/lib/dates";
import { useI18n } from "@/lib/i18n/client";
import { formatLocale } from "@/lib/i18n/messages";

/** Times render in the hall's zone. English keeps the original format; Arabic uses Intl with Latin digits. */
export function HallTime({
  value,
  timeZone,
  showZone = false,
}: {
  value: string | Date;
  timeZone: string;
  showZone?: boolean;
}) {
  const { locale } = useI18n();
  const iso = typeof value === "string" ? value : value.toISOString();
  const text =
    locale === "ar"
      ? new Intl.DateTimeFormat(formatLocale("ar"), {
          timeZone,
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
          ...(showZone ? { timeZoneName: "short" as const } : {}),
        }).format(new Date(iso))
      : showZone
        ? formatHallTimeWithZone(value, timeZone)
        : formatHallTime(value, timeZone);
  return <time dateTime={iso}>{text}</time>;
}
