import { createBrowserClient } from "@supabase/ssr";
import { asSessionCookie } from "./session";

/** Browser client (anon key + user session). Used only for OAuth start and Realtime. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Same rule as the server: auth cookies end with the browser session, not after 400 days.
      cookies: {
        getAll: () =>
          document.cookie
            .split("; ")
            .filter(Boolean)
            .map((pair) => {
              const i = pair.indexOf("=");
              return { name: pair.slice(0, i), value: decodeURIComponent(pair.slice(i + 1)) };
            }),
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            const o = asSessionCookie(options);
            let c = `${name}=${encodeURIComponent(value)}; Path=${o.path ?? "/"}`;
            if (o.maxAge !== undefined) c += `; Max-Age=${o.maxAge}`;
            if (o.expires) c += `; Expires=${o.expires.toUTCString()}`;
            if (o.sameSite) c += `; SameSite=${String(o.sameSite)}`;
            if (o.secure) c += "; Secure";
            document.cookie = c;
          }
        },
      },
    },
  );
}
