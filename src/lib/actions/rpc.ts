import "server-only";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/logger";
import { mapBackendError } from "./errors";
import { localizeResult } from "./localize";
import { ok, type ActionResult } from "./result";

/**
 * Calls a backend RPC as the signed-in user and converts failures to ActionResult.
 * Call only AFTER the permission fast-check (withPermission); the RPC enforces it again.
 */
export async function callRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
): Promise<ActionResult<T>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const mapped = mapBackendError(error);
    if (!mapped.ok && mapped.code === "UNKNOWN")
      log("error", "rpc failed", { fn, code: error.code });
    return localizeResult(mapped);
  }
  return ok(data as T);
}
