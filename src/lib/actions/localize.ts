import "server-only";
import { getLocale } from "@/lib/i18n/server";
import { DETAIL_MESSAGES, ERROR_MESSAGES } from "./errors";
import { DETAIL_MESSAGES_AR, ERROR_MESSAGES_AR } from "./errorsAr";
import type { ActionResult } from "./result";

let byEnglish: Map<string, string> | null = null;
function table(): Map<string, string> {
  if (!byEnglish) {
    byEnglish = new Map();
    for (const [code, en] of Object.entries(ERROR_MESSAGES))
      byEnglish.set(en, ERROR_MESSAGES_AR[code as keyof typeof ERROR_MESSAGES_AR]);
    for (const [detail, en] of Object.entries(DETAIL_MESSAGES))
      byEnglish.set(en, DETAIL_MESSAGES_AR[detail as keyof typeof DETAIL_MESSAGES_AR]);
  }
  return byEnglish;
}

/** Arabic text for a known English backend message; anything unknown is returned as it is. */
export function localizeText(text: string): string {
  return table().get(text) ?? text;
}

/**
 * Translates the user-facing message of a failed ActionResult to the visitor's language. Codes and
 * field names are untouched, so callers that branch on them keep working. English is the identity.
 */
export async function localizeResult<T>(r: ActionResult<T>): Promise<ActionResult<T>> {
  if (r.ok) return r;
  let locale = "en";
  try {
    locale = await getLocale();
  } catch {
    // Not inside a request (unit tests): keep English.
  }
  if (locale !== "ar") return r;
  return {
    ...r,
    message: localizeText(r.message),
    ...(r.fieldErrors
      ? {
          fieldErrors: Object.fromEntries(
            Object.entries(r.fieldErrors).map(([k, v]) => [k, localizeText(v)]),
          ),
        }
      : {}),
  };
}
