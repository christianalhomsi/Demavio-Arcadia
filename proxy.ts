import createMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const response = intlMiddleware(request);
  return await updateSession(request, response);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
