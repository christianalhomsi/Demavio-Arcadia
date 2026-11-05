"use server";

import { revalidatePath } from "next/cache";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import { isUuid } from "@/lib/auth/authorize";

export type PairingKind = "agent" | "hall_server";

/**
 * Creates a one-time pairing code (10 minutes). The plaintext is returned once and never stored; only its hash is in
 * the database. A new code of the same kind invalidates the previous one.
 */
export async function createPairingCodeAction(
  hallId: string,
  kind: PairingKind,
): Promise<ActionResult<{ code: string; validUntil: string }>> {
  return withPermission(hallId, "hall.settings.manage", async () => {
    if (kind !== "agent" && kind !== "hall_server") return fail("VALIDATION", "Invalid kind");
    const r = await callRpc<{ pairing_code: string; valid_until: string }[]>(
      "create_pairing_code",
      {
        p_hall_id: hallId,
        p_kind: kind,
      },
    );
    if (!r.ok) return r;
    const row = r.data?.[0];
    if (!row) return fail("UNKNOWN", "No code returned");
    return { ok: true, data: { code: row.pairing_code, validUntil: row.valid_until } };
  });
}

export async function revokeHallServerAction(
  hallId: string,
  hallServerId: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "hall.settings.manage", async () => {
    if (!isUuid(hallServerId)) return fail("VALIDATION", "Invalid server");
    const r = await callRpc<null>("revoke_hall_server", { p_hall_server_id: hallServerId });
    if (!r.ok) return r;
    revalidatePath(`/halls/${hallId}/agents`);
    return { ok: true, data: null };
  });
}
