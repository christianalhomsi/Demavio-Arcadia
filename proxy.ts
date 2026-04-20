import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Redirect /login to /auth/login
  if (pathname.endsWith('/login') && !pathname.includes('/auth/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace('/login', '/auth/login');
    return NextResponse.redirect(url);
  }
  
  const response = intlMiddleware(request);
  return await updateSession(request, response);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
