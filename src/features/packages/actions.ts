"use server";

import { resolvePlayer } from "@/features/sessions/player";
import { revalidatePath } from "next/cache";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import { isUuid } from "@/lib/auth/authorize";
import { parseMoneyForCurrency } from "@/lib/money";
import { dateToIso, hmToMinutes } from "@/lib/timeOfDay";
import { getHallCurrency } from "@/features/invoices/queries";
import { packageSchema, type PackageInput } from "./schemas";
import { listPackageUses, type PackageUseRow } from "./queries";

const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

function refresh(hallId: string) {
  revalidatePath(`/halls/${hallId}/packages`);
  revalidatePath(`/halls/${hallId}/sessions`);
}

/** Creates (packageId null) or edits a package. Owners only; the RPC re-checks it. */
export async function upsertPackageAction(
  hallId: string,
  packageId: string | null,
  input: PackageInput,
): Promise<ActionResult<{ id: string }>> {
  return withPermission(hallId, "package.manage", async () => {
    const parsed = packageSchema.safeParse(input);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return invalid(String(i?.path[0] ?? "name"), i?.message ?? "Invalid input");
    }
    if (packageId !== null && !isUuid(packageId)) return invalid("name", "Invalid request");
    const d = parsed.data;

    const currency = await getHallCurrency(hallId);
    if (!currency) return fail("NOT_FOUND", "That hall could not be found.");
    const price = parseMoneyForCurrency(d.priceText, currency);
    if (price === null) return invalid("priceText", "Enter a valid price.");

    let deviceId: string | null = null;
    let category: string | null = null;
    if (d.target.startsWith("device:")) {
      deviceId = d.target.slice(7);
      if (!isUuid(deviceId)) return invalid("target", "Choose a device");
    } else if (d.target.startsWith("category:")) {
      category = d.target.slice(9).trim() || null;
      if (!category) return invalid("target", "Choose a category");
    } else if (d.target !== "") return invalid("target", "Invalid request");

    let from: number | null = null;
    let to: number | null = null;
    if (d.from !== "" || d.to !== "") {
      from = hmToMinutes(d.from);
      to = hmToMinutes(d.to);
      if (from === null || to === null || to <= from || from > 1439)
        return invalid("from", "Enter a valid time range.");
    }

    const validFrom = d.validFrom === "" ? null : dateToIso(d.validFrom);
    const validUntil = d.validUntil === "" ? null : dateToIso(d.validUntil, true);
    if (d.validFrom !== "" && validFrom === null)
      return invalid("validFrom", "Enter a valid date.");
    if (d.validUntil !== "" && validUntil === null)
      return invalid("validUntil", "Enter a valid date.");

    let maxUses: number | null = null;
    if (d.maxUses !== "") {
      if (!/^\d{1,6}$/.test(d.maxUses) || Number(d.maxUses) < 1)
        return invalid("maxUses", "Enter a whole number of 1 or more.");
      maxUses = Number(d.maxUses);
    }

    const r = await callRpc<string>("upsert_package", {
      p_hall_id: hallId,
      p_id: packageId,
      p_name: d.name,
      p_duration: d.durationMinutes,
      p_price_minor: price,
      p_device_id: deviceId,
      p_category: category,
      p_from_minute: from,
      p_to_minute: to,
      p_valid_from: validFrom,
      p_valid_until: validUntil,
      p_max_uses: maxUses,
      p_active: d.active,
    });
    if (!r.ok) return r;
    refresh(hallId);
    return { ok: true, data: { id: r.data } };
  });
}

/** Starts a session priced by a package. The price and duration come from the package, never the client. */
export async function startPackageSessionAction(
  hallId: string,
  input: { packageId: string; deviceId: string; guestName: string; username?: string },
  idempotencyKey: string,
): Promise<ActionResult<{ sessionId: string }>> {
  return withPermission(hallId, "session.start", async () => {
    if (!isUuid(input.packageId) || !isUuid(input.deviceId) || !isUuid(idempotencyKey))
      return invalid("deviceId", "Invalid request");
    const guest = input.guestName.trim();
    const player = await resolvePlayer(hallId, input.username);
    if (!player.ok) return player;
    if (!player.data && (guest.length < 1 || guest.length > 80))
      return invalid("guestName", "Enter a customer name of 1 to 80 characters.");
    const r = await callRpc<string>("start_package_session", {
      p_hall_id: hallId,
      p_package_id: input.packageId,
      p_device_id: input.deviceId,
      p_customer_id: player.data,
      p_guest_name: player.data ? null : guest,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    refresh(hallId);
    revalidatePath(`/halls/${hallId}/devices`);
    return { ok: true, data: { sessionId: r.data } };
  });
}

export async function getPackageUsesAction(
  hallId: string,
  packageId: string,
): Promise<ActionResult<PackageUseRow[]>> {
  return withPermission(hallId, "package.manage", async () => {
    if (!isUuid(packageId)) return invalid("packageId", "Invalid request");
    const rows = await listPackageUses(packageId);
    if (!rows) return fail("UNKNOWN", "Usage could not be loaded.");
    return { ok: true, data: rows };
  });
}
