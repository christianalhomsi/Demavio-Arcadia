import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get("code");
  const error = searchParams.get("error");
  
  const { locale } = await params;

  console.log('🔐 OAuth Callback - Locale:', locale);
  console.log('🔐 OAuth Callback - Code:', code ? 'Present' : 'Missing');
  console.log('🔐 OAuth Callback - Error:', error);

  if (error) {
    console.error('❌ OAuth Error:', error);
    return NextResponse.redirect(`${origin}/${locale}/auth/login?error=${error}`);
  }
  if (!code) {
    console.error('❌ No code provided');
    return NextResponse.redirect(`${origin}/${locale}/auth/login`);
  }

  const supabase = await getServerClient();
  const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  
  if (exchangeError) {
    console.error('❌ Exchange Error:', exchangeError);
    return NextResponse.redirect(`${origin}/${locale}/auth/login?error=${exchangeError.message}`);
  }

  console.log('✅ Session exchanged successfully');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('❌ No user after exchange');
    return NextResponse.redirect(`${origin}/${locale}/auth/login`);
  }

  console.log('✅ User found:', user.email);

  // ensure profile exists - create if not exists
  const { data: existingProfile, error: profileCheckError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  console.log('📋 Existing profile:', existingProfile);

  if (!existingProfile) {
    console.log('➕ Creating new profile...');
    const { error: insertError } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      role: "player"
    });
    
    if (insertError) {
      console.error('❌ Profile creation error:', insertError);
    } else {
      console.log('✅ Profile created successfully');
    }
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profile?.role;

  console.log('👤 User role:', role);

  // Determine redirect URL
  let redirectUrl = `${origin}/${locale}/halls`;

  if (role === "super_admin") {
    redirectUrl = `${origin}/${locale}/admin`;
  } else if (role === "hall_manager" || role === "hall_staff") {
    const { data: assignment } = await supabase
      .from("staff_assignments").select("hall_id").eq("user_id", user.id).maybeSingle();
    redirectUrl = `${origin}/${locale}${assignment?.hall_id ? `/dashboard/${assignment.hall_id}` : "/halls"}`;
  }

  console.log('🔄 Redirecting to:', redirectUrl);

  return NextResponse.redirect(redirectUrl);
}
