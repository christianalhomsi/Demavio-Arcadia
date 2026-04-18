import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/env";
import { HALL_DASHBOARD_ROLES } from "@/types/user-role";

export async function updateSession(request: NextRequest, response?: NextResponse) {
  let supabaseResponse = response || NextResponse.next({ request });
  const supabaseEnv = getSupabaseEnv();

  const supabase = createServerClient(supabaseEnv.url, supabaseEnv.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  
  // Extract locale from pathname
  const locale = pathname.split('/')[1];
  const localePrefix = ['ar', 'en'].includes(locale) ? `/${locale}` : '';
  
  const isAuthPage = pathname.includes("/login") || pathname.includes("/verify-otp") || pathname.includes("/auth/");

  if (!user && !isAuthPage) {
    return NextResponse.redirect(new URL(`${localePrefix}/login`, request.url));
  }

  if (user && (pathname.includes("/login") || pathname.includes("/verify-otp"))) {
    // check role to redirect to correct place
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role as string | undefined;

    if (role && HALL_DASHBOARD_ROLES.includes(role as any)) {
      const { data: assignment } = await supabase
        .from("staff_assignments")
        .select("hall_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (assignment?.hall_id) {
        return NextResponse.redirect(new URL(`${localePrefix}/dashboard/${assignment.hall_id}`, request.url));
      }
    }

    return NextResponse.redirect(new URL(`${localePrefix}/halls`, request.url));
  }

  return supabaseResponse;
}
