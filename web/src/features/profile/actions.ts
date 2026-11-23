"use server";

import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { destinationAfterChoosing, needsUsername } from "@/lib/auth/context";
import { MIN_PASSWORD, USERNAME } from "@/lib/auth/credentials";
import { createClient } from "@/lib/supabase/server";
import { getMyContext } from "@/lib/auth/session";

/**
 * Chooses the signed-in person's username, once. Returns where to go next. The database checks the
 * format, uniqueness and that it is not just their account name; this only gives early messages.
 */
export async function setMyUsernameAction(
  username: string,
  next: string | null,
): Promise<ActionResult<{ destination: string }>> {
  const ctx = await getMyContext();
  if (!ctx) return fail("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  if (!needsUsername(ctx))
    return { ok: true, data: { destination: destinationAfterChoosing(ctx, next) } };
  const name = username.trim();
  if (!USERNAME.test(name))
    return fail("VALIDATION", "Invalid username.", { username: "Invalid username." });

  const r = await callRpc<null>("set_my_username", { p_username: name });
  if (!r.ok) return r;
  return {
    ok: true,
    data: {
      destination: destinationAfterChoosing(
        { ...ctx, profile: { ...ctx.profile, username: name.toLowerCase() } },
        next,
      ),
    },
  };
}

/** Updates the signed-in person's username and display name (any role). */
export async function updateMyAccountAction(
  username: string,
  displayName: string,
): Promise<ActionResult<null>> {
  const ctx = await getMyContext();
  if (!ctx) return fail("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  const name = username.trim();
  if (!USERNAME.test(name))
    return fail("VALIDATION", "Invalid username.", { username: "Invalid username." });
  if (displayName.trim().length > 80)
    return fail("VALIDATION", "Name is too long.", { displayName: "Name is too long." });
  return callRpc<null>("update_my_account", {
    p_username: name,
    p_display_name: displayName.trim(),
  });
}

/** Changes the password after re-checking the current one. Email/password accounts only. */
export async function changeMyPasswordAction(
  current: string,
  next: string,
): Promise<ActionResult<null>> {
  const ctx = await getMyContext();
  if (!ctx?.profile.email)
    return fail("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  if (next.length < MIN_PASSWORD)
    return fail("VALIDATION", "Password too short.", { next: "Password too short." });
  const supabase = await createClient();
  const check = await supabase.auth.signInWithPassword({
    email: ctx.profile.email,
    password: current,
  });
  if (check.error) return fail("VALIDATION", "Wrong password.", { current: "wrong" });
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return fail("VALIDATION", error.message, { next: error.message });
  return { ok: true, data: null };
}
