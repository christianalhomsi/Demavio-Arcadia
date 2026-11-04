import "server-only";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";

/** Looks a registered player up by username; null data when none was typed. Used by session starts. */
export async function resolvePlayer(
  hallId: string,
  username: string | undefined,
): Promise<ActionResult<string | null>> {
  const name = (username ?? "").trim().replace(/^@/, "");
  if (!name) return { ok: true, data: null };
  const r = await callRpc<string>("resolve_player", { p_hall_id: hallId, p_username: name });
  if (!r.ok) {
    return r.code === "NOT_FOUND"
      ? fail("VALIDATION", "No player was found with that username.", {
          username: "No player was found with that username.",
        })
      : r;
  }
  return { ok: true, data: r.data };
}
