import "server-only";
import { authorizePlatform } from "@/lib/auth/authorize";
import type { MyContext, PlatformRole } from "@/lib/auth/context";
import { getMyContext } from "@/lib/auth/session";
import { ERROR_MESSAGES } from "./errors";
import { localizeResult } from "./localize";
import { fail, type ActionResult } from "./result";

/** Fast-fail check for platform Server Actions; the RPC re-checks the role itself (spec §21.1). */
export async function runPlatformAuthorized<T>(
  ctx: MyContext | null,
  roles: PlatformRole | PlatformRole[],
  handler: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  if (!ctx) return localizeResult(fail("UNAUTHENTICATED", ERROR_MESSAGES.UNAUTHENTICATED));
  if (authorizePlatform(ctx, roles).status !== "ok")
    return localizeResult(fail("FORBIDDEN", ERROR_MESSAGES.FORBIDDEN));
  return handler();
}

export async function withPlatformRole<T>(
  roles: PlatformRole | PlatformRole[],
  handler: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return runPlatformAuthorized(await getMyContext(), roles, handler);
}
