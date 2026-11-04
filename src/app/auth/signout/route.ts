import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_AT_COOKIE } from "@/lib/supabase/session";

/** POST only, so a link or image tag cannot sign a user out (CSRF-safe). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Player pages sign out back to the public home page; everything else goes to /login.
  const form = await request.formData().catch(() => null);
  const next = safeNext(form?.get("next")?.toString(), "/login");
  const response = NextResponse.redirect(new URL(next, request.nextUrl.origin), { status: 303 });
  response.cookies.delete(LOGIN_AT_COOKIE);
  return response;
}
