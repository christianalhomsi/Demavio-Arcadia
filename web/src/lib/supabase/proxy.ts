import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicEnv } from "./env";
import { LOGIN_AT_COOKIE, asSessionCookie, loginExpired } from "./session";

/** Routes reachable without a session (/book is the public player flow; booking itself needs sign-in). */
const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/signout", "/book"];

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" || PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
}

/**
 * Refreshes the Supabase session cookie and redirects anonymous users to /login.
 * This is an optimistic check only; pages and actions still authorize on the server.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = supabasePublicEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, asSessionCookie(options)),
        );
      },
    },
  });

  // getClaims validates the JWT; do not run code between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  let signedIn = Boolean(data?.claims);

  // A sign-in ends with the browser session or after 8 hours, whichever comes first. The timer starts
  // the first time we see the session and is dropped with it, so the next sign-in starts a new one.
  const loginAt = request.cookies.get(LOGIN_AT_COOKIE)?.value;
  const now = Date.now();
  if (signedIn && loginExpired(loginAt, now)) {
    await supabase.auth.signOut();
    signedIn = false;
  }
  if (signedIn && !loginAt) {
    response.cookies.set(LOGIN_AT_COOKIE, String(now), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
  if (!signedIn && loginAt) response.cookies.delete(LOGIN_AT_COOKIE);

  const { pathname, search } = request.nextUrl;
  if (!signedIn && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(loginUrl);
    // Carry over the cookies cleared by signOut above.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}
