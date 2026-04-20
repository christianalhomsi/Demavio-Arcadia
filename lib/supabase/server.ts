import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/env";

export async function getServerClient(response?: NextResponse) {
  const cookieStore = await cookies();
  const supabaseEnv = getSupabaseEnv();

  return createServerClient(supabaseEnv.url, supabaseEnv.anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) => {
          cookieStore.set(name, value, options);
          if (response) {
            response.cookies.set(name, value, options);
          }
        });
      },
    },
  });
}
