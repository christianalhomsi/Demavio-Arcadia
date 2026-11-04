"use server";

import { revalidatePath } from "next/cache";
import { callRpc } from "@/lib/actions/rpc";
import { fail, type ActionResult } from "@/lib/actions/result";
import { withPermission } from "@/lib/actions/withPermission";
import { isUuid } from "@/lib/auth/authorize";
import { parseMoneyForCurrency } from "@/lib/money";
import { getHallCurrency } from "@/features/invoices/queries";
import { MAX_QUANTITY, productSchema, type ProductInput } from "./schemas";

const invalid = (field: string, message: string) =>
  fail("VALIDATION", message, { [field]: message });

function refresh(hallId: string) {
  revalidatePath(`/halls/${hallId}/products`);
  revalidatePath(`/halls/${hallId}/sessions`);
}

/** Creates (productId null) or edits a catalog product. Owners only; the RPC re-checks it. */
export async function upsertProductAction(
  hallId: string,
  productId: string | null,
  input: ProductInput,
): Promise<ActionResult<{ id: string }>> {
  return withPermission(hallId, "product.manage", async () => {
    const parsed = productSchema.safeParse(input);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return invalid(String(i?.path[0] ?? "name"), i?.message ?? "Invalid input");
    }
    if (productId !== null && !isUuid(productId)) return invalid("name", "Invalid request");
    const currency = await getHallCurrency(hallId);
    if (!currency) return fail("NOT_FOUND", "That hall could not be found.");
    const price = parseMoneyForCurrency(parsed.data.priceText, currency);
    if (price === null) return invalid("priceText", "Enter a valid price.");

    const r = await callRpc<string>("upsert_product", {
      p_hall_id: hallId,
      p_id: productId,
      p_name: parsed.data.name,
      p_price_minor: price,
      p_active: parsed.data.active,
    });
    if (!r.ok) return r;
    refresh(hallId);
    return { ok: true, data: { id: r.data } };
  });
}

/** Adds a catalog product to a running session. The price is read from the catalog by the database. */
export async function addSessionItemAction(
  hallId: string,
  sessionId: string,
  productId: string,
  quantity: number,
  idempotencyKey: string,
): Promise<ActionResult<{ id: string }>> {
  return withPermission(hallId, "product.sell", async () => {
    if (!isUuid(sessionId) || !isUuid(productId) || !isUuid(idempotencyKey)) {
      return invalid("productId", "Invalid request");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return invalid("quantity", `Choose 1 to ${MAX_QUANTITY}.`);
    }
    const r = await callRpc<string>("add_session_item", {
      p_session: sessionId,
      p_product: productId,
      p_quantity: quantity,
      p_key: idempotencyKey,
    });
    if (!r.ok) return r;
    refresh(hallId);
    revalidatePath(`/halls/${hallId}/sessions/${sessionId}`);
    return { ok: true, data: { id: r.data } };
  });
}

export async function removeSessionItemAction(
  hallId: string,
  sessionId: string,
  itemId: string,
): Promise<ActionResult<null>> {
  return withPermission(hallId, "product.sell", async () => {
    if (!isUuid(sessionId) || !isUuid(itemId)) return invalid("itemId", "Invalid request");
    const r = await callRpc<null>("remove_session_item", { p_item: itemId });
    if (!r.ok) return r;
    refresh(hallId);
    revalidatePath(`/halls/${hallId}/sessions/${sessionId}`);
    return { ok: true, data: null };
  });
}
