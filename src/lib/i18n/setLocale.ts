"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale } from "./messages";

/** Language is a cosmetic preference, so no authorization is needed; the value is whitelisted. */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
