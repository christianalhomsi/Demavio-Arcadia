"use server";

import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { destinationAfterChoosing, needsUsername } from "@/lib/auth/context";
import { USERNAME } from "@/lib/auth/credentials";
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
