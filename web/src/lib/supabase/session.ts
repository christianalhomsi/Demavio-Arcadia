/** A sign-in lasts until the browser is closed, and never longer than this. */
export const MAX_SESSION_MS = 8 * 60 * 60 * 1000;

/** Set by the proxy the first time it sees a session; the 8-hour limit counts from it. */
export const LOGIN_AT_COOKIE = "gh-login-at";

/** Options of a cookie that is being deleted (Supabase sends maxAge 0 or a past expiry). */
function isDeletion(options: { maxAge?: number; expires?: Date }): boolean {
  return options.maxAge === 0 || (options.expires !== undefined && options.expires.getTime() <= 0);
}

/**
 * Turns Supabase's long-lived auth cookies (400 days by default) into session cookies, so the
 * browser drops them when it closes. Deletions are left alone.
 */
export function asSessionCookie<T extends { maxAge?: number; expires?: Date }>(options: T): T {
  if (isDeletion(options)) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}

export function loginExpired(loginAt: string | undefined, now: number): boolean {
  const at = Number(loginAt);
  return Number.isFinite(at) && at > 0 && now - at > MAX_SESSION_MS;
}
