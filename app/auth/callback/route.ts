import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");
  
  // Default to Arabic
  const locale = 'ar';

  console.log('🔐 OAuth Callback (fallback) - Code:', code ? 'Present' : 'Missing');

  if (error) return NextResponse.redirect(`${origin}/${locale}/auth/login?error=${error}`);
  if (!code) return NextResponse.redirect(`${origin}/${locale}/auth/login`);

  const supabase = await getServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return NextResponse.redirect(`${origin}/${locale}/auth/login?error=${exchangeError.message}`);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/${locale}/auth/login`);

  // ensure profile exists - create if not exists
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!existingProfile) {
    // Create new profile for new user
    await supabase.from("profiles").insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      role: "player"
    });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profile?.role;

  if (role === "super_admin") return NextResponse.redirect(`${origin}/${locale}/admin`);

  if (role === "hall_manager" || role === "hall_staff") {
    const { data: assignment } = await supabase
      .from("staff_assignments").select("hall_id").eq("user_id", user.id).maybeSingle();
    return NextResponse.redirect(`${origin}/${locale}${assignment?.hall_id ? `/dashboard/${assignment.hall_id}` : "/halls"}`);
  }

  return NextResponse.redirect(`${origin}/${locale}/halls`);
}
