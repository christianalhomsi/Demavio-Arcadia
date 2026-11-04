import type { Permission } from "@/contracts/permissions";
import { authorizeHall } from "@/lib/auth/authorize";
import type { HallMembership, MyContext } from "@/lib/auth/context";
import { ERROR_MESSAGES } from "./errors";
import { localizeResult } from "./localize";
import { fail, type ActionResult } from "./result";

export interface AuthorizedCall {
  ctx: MyContext | null;
  hallId: string;
  permission: Permission;
}

/**
 * Runs `handler` only if the caller is allowed. This is the fast-fail check for Server Actions;
 * the RPC the handler calls MUST re-check permission itself, because this layer works from a
 * context that may be stale (spec §21.1, §29).
 */
export async function runAuthorized<T>(
  { ctx, hallId, permission }: AuthorizedCall,
  handler: (membership: HallMembership) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  if (!ctx) return localizeResult(fail("UNAUTHENTICATED", ERROR_MESSAGES.UNAUTHENTICATED));
  const access = authorizeHall(ctx, hallId, permission);
  if (access.status === "not_found")
    return localizeResult(fail("NOT_FOUND", ERROR_MESSAGES.NOT_FOUND));
  if (access.status === "forbidden")
    return localizeResult(fail("FORBIDDEN", ERROR_MESSAGES.FORBIDDEN));
  return handler(access.membership);
}
