import "server-only";
import type { Permission } from "@/contracts/permissions";
import { getMyContext } from "@/lib/auth/session";
import type { HallMembership } from "@/lib/auth/context";
import { runAuthorized } from "./authorized";
import type { ActionResult } from "./result";

/**
 * Use at the top of every Server Action that changes hall data:
 *
 *   return withPermission(hallId, "payment.collect", async (membership) => { ...rpc... });
 */
export async function withPermission<T>(
  hallId: string,
  permission: Permission,
  handler: (membership: HallMembership) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return runAuthorized({ ctx: await getMyContext(), hallId, permission }, handler);
}
