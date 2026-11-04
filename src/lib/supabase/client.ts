import { createBrowserClient } from "@supabase/ssr";

/** Browser client (anon key + user session). Used only for OAuth start and Realtime. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
