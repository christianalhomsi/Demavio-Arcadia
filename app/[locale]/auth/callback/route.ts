import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/env";

export async function GET(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");
  
  const { locale } = await params;

  if (error) {
    return NextResponse.redirect(`${origin}/${locale}/auth/login?error=${error}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/${locale}/auth/login`);
  }

  const cookieStore = await cookies();
  const supabaseEnv = getSupabaseEnv();
  
  const supabase = createServerClient(supabaseEnv.url, supabaseEnv.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  
  if (exchangeError) {
    return NextResponse.redirect(`${origin}/${locale}/auth/login?error=${exchangeError.message}`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/${locale}/auth/login`);
  }

  // ensure profile exists - create if not exists
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, role, username")
    .eq("id", user.id)
    .maybeSingle();

  if (!existingProfile) {
    await supabase.from("profiles").insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      role: "player"
    });
    return NextResponse.redirect(`${origin}/${locale}/auth/set-username`);
  }

  // Check if username is set
  if (!existingProfile.username) {
    return NextResponse.redirect(`${origin}/${locale}/auth/set-username`);
  }

  const role = existingProfile.role;

  // Determine redirect URL
  let redirectUrl = `${origin}/${locale}/halls`;

  if (role === "super_admin") {
    redirectUrl = `${origin}/${locale}/admin`;
  } else if (role === "hall_manager" || role === "hall_staff") {
    const { data: assignment } = await supabase
      .from("staff_assignments").select("hall_id").eq("user_id", user.id).maybeSingle();
    redirectUrl = `${origin}/${locale}${assignment?.hall_id ? `/dashboard/${assignment.hall_id}` : "/halls"}`;
  }

  return NextResponse.redirect(redirectUrl);
}
