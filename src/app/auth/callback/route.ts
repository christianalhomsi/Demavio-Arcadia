import { NextResponse, type NextRequest } from "next/server";
import { postLoginDestination } from "@/lib/auth/context";
import { getMyContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const providerError = searchParams.get("error");

  if (providerError) {
    const reason = providerError === "access_denied" ? "cancelled" : "failed";
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }
  if (!code) return NextResponse.redirect(`${origin}/login?error=failed`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=failed`);

  const ctx = await getMyContext();
  if (!ctx) return NextResponse.redirect(`${origin}/no-access`);
  if (ctx.profile.status !== "active") {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=inactive`);
  }

  // Staff go to their dashboards, players back to where they were. Always build the URL from our
  // own origin; never from request-supplied hosts.
  return NextResponse.redirect(`${origin}${postLoginDestination(ctx, searchParams.get("next"))}`);
}
