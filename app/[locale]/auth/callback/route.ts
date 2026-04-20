import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

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

  const authRedirectResponse = NextResponse.redirect(`${origin}/${locale}/halls`);
  const supabase = await getServerClient(authRedirectResponse);
  const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  
  if (exchangeError) {
    const fallbackUrl = new URL(`${origin}/${locale}/auth/login`);
    fallbackUrl.searchParams.set("error", exchangeError.message);
    fallbackUrl.searchParams.set("oauth_code", code);
    return NextResponse.redirect(fallbackUrl.toString());
  }

  if (sessionData?.session) {
    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
    });

  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/${locale}/auth/login`);
  }

  // ensure profile exists - create if not exists
  const { data: existingProfile, error: profileCheckError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!existingProfile) {
    const { error: insertError } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      role: "player"
    });
    

  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profile?.role;

  // Determine redirect URL
  let redirectUrl = `${origin}/${locale}/halls`;

  if (role === "super_admin") {
    redirectUrl = `${origin}/${locale}/admin`;
  } else if (role === "hall_manager" || role === "hall_staff") {
    const { data: assignment } = await supabase
      .from("staff_assignments").select("hall_id").eq("user_id", user.id).maybeSingle();
    redirectUrl = `${origin}/${locale}${assignment?.hall_id ? `/dashboard/${assignment.hall_id}` : "/halls"}`;
  }

  authRedirectResponse.headers.set("location", redirectUrl);
  return authRedirectResponse;
}
