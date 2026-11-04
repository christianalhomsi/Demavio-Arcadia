import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

/** POST only, so a link or image tag cannot sign a user out (CSRF-safe). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Player pages sign out back to the public home page; everything else goes to /login.
  const form = await request.formData().catch(() => null);
  const next = safeNext(form?.get("next")?.toString(), "/login");
  return NextResponse.redirect(new URL(next, request.nextUrl.origin), { status: 303 });
}
