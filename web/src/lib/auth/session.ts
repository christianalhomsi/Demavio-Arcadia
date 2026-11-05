import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/logger";
import { needsUsername, type MyContext } from "./context";

/**
 * Loads the caller's profile, platform roles and hall memberships from the backend.
 * Cached per request only (never across requests) so revocations apply on next navigation.
 */
export const getMyContext = cache(async (): Promise<MyContext | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return null;

  const { data, error } = await supabase.rpc("get_my_context");
  if (error || !data) {
    log("error", "get_my_context failed", { code: error?.code });
    return null;
  }
  return data as unknown as MyContext;
});

/** Requires a signed-in, active user. Anonymous -> /login, inactive -> /no-access. */
export async function requireUser(): Promise<MyContext> {
  const ctx = await getMyContext();
  if (!ctx) redirect("/login");
  if (ctx.profile.status !== "active") redirect("/no-access?reason=inactive");
  if (needsUsername(ctx)) redirect("/choose-username");
  return ctx;
}
