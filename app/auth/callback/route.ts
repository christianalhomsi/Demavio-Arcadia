import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");
  
  // Default to Arabic
  const locale = 'ar';

  if (error) return NextResponse.redirect(`${origin}/${locale}/auth/login?error=${error}`);
  if (!code) return NextResponse.redirect(`${origin}/${locale}/auth/login`);

  const tempResponse = NextResponse.next();
  const supabase = await getServerClient(tempResponse);
  const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    const fallbackUrl = new URL(`${origin}/${locale}/auth/login`);
    fallbackUrl.searchParams.set("error", exchangeError.message);
    fallbackUrl.searchParams.set("oauth_code", code);
    return NextResponse.redirect(fallbackUrl.toString());
  }

  if (sessionData?.session) {
    await supabase.auth.setSession({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
    });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/${locale}/auth/login`);

  // ensure profile exists - create if not exists
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, role, username")
    .eq("id", user.id)
    .maybeSingle();

  if (!existingProfile) {
    // Create new profile for new user - redirect to set username
    await supabase.from("profiles").insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      role: "player"
    });
    
    // Redirect to set username page
    const setUsernameResponse = NextResponse.redirect(`${origin}/${locale}/auth/set-username`);
    tempResponse.cookies.getAll().forEach(cookie => setUsernameResponse.cookies.set(cookie));
    return setUsernameResponse;
  }

  // Check if username is set
  if (!existingProfile.username) {
    const setUsernameResponse = NextResponse.redirect(`${origin}/${locale}/auth/set-username`);
    tempResponse.cookies.getAll().forEach(cookie => setUsernameResponse.cookies.set(cookie));
    return setUsernameResponse;
  }

  const role = existingProfile.role;

  if (role === "super_admin") {
    const adminResponse = NextResponse.redirect(`${origin}/${locale}/admin`);
    tempResponse.cookies.getAll().forEach(cookie => adminResponse.cookies.set(cookie));
    return adminResponse;
  }

  if (role === "hall_manager" || role === "hall_staff") {
    const { data: assignment } = await supabase
      .from("staff_assignments").select("hall_id").eq("user_id", user.id).maybeSingle();
    const dashboardResponse = NextResponse.redirect(`${origin}/${locale}${assignment?.hall_id ? `/dashboard/${assignment.hall_id}` : "/halls"}`);
    tempResponse.cookies.getAll().forEach(cookie => dashboardResponse.cookies.set(cookie));
    return dashboardResponse;
  }

  const hallsResponse = NextResponse.redirect(`${origin}/${locale}/halls`);
  tempResponse.cookies.getAll().forEach(cookie => hallsResponse.cookies.set(cookie));
  return hallsResponse;
}
