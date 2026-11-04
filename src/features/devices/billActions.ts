"use server";

import { withPermission } from "@/lib/actions/withPermission";
import { ok, fail, type ActionResult } from "@/lib/actions/result";
import { isUuid } from "@/lib/auth/authorize";
import { getHallSettingsBundle } from "@/features/halls/queries";
import {
  getInvoiceDetail,
  getInvoiceForSession,
  getInvoicePayer,
} from "@/features/invoices/queries";
import type { InvoicePayer } from "@/features/invoices/queries";
import type { InvoiceRow } from "@/features/invoices/queries";
import { listProducts, listSessionItems } from "@/features/products/queries";
import type { ProductRow, SessionItemRow } from "@/features/products/queries";
import { formatMoney } from "@/lib/money";
import { listWallets } from "@/features/wallets/queries";

export interface DeviceBill {
  items: SessionItemRow[];
  /** Active products offered as one-tap buttons; empty unless the viewer may sell. */
  products: ProductRow[];
  invoice: InvoiceRow | null;
  payer: InvoicePayer | null;
  methods: ("cash" | "wallet")[];
  partialAllowed: boolean;
  wallets: { id: string; label: string; balanceMinor: number; currency: string; frozen: boolean }[];
  canSell: boolean;
  canEnd: boolean;
  canPay: boolean;
}

/**
 * Everything the device bill sheet shows for one session, loaded in one round trip. Each part is
 * included only if the viewer may see it; the database enforces the same rules on every query.
 */
export async function getDeviceBillAction(
  hallId: string,
  sessionId: string,
): Promise<ActionResult<DeviceBill>> {
  return withPermission(hallId, "device.view", async (m) => {
    if (!isUuid(sessionId)) return fail("VALIDATION", "Invalid request");
    const perms = m.permissions;
    const canSell = perms.includes("product.sell");
    const canPay = perms.includes("payment.collect");
    const canSeeItems = canSell || perms.includes("invoice.view");

    const [items, products, link] = await Promise.all([
      canSeeItems ? listSessionItems(sessionId) : null,
      canSell ? listProducts(hallId) : null,
      perms.includes("invoice.view") ? getInvoiceForSession(sessionId) : null,
    ]);
    const detail = link ? await getInvoiceDetail(hallId, link.id) : null;

    const payer = detail && canPay ? await getInvoicePayer(detail.invoice.id) : null;
    let methods: DeviceBill["methods"] = ["cash"];
    let partialAllowed = false;
    let wallets: DeviceBill["wallets"] = [];
    if (detail && canPay) {
      const bundle = await getHallSettingsBundle(hallId);
      if (bundle) {
        methods = bundle.settings.paymentMethods;
        partialAllowed = bundle.settings.allowPartialPayments;
        if (methods.includes("wallet") && perms.includes("wallet.view")) {
          const rows = (await listWallets(hallId, { limit: 100, offset: 0 }))?.rows ?? [];
          wallets = rows.map((w) => ({
            id: w.id,
            label: `${w.customerName ?? w.customerEmail ?? w.id.slice(0, 8)} · ${formatMoney(w.balanceMinor, w.currency)}`,
            balanceMinor: w.balanceMinor,
            currency: w.currency,
            frozen: w.status === "frozen",
          }));
        }
      }
    }

    return ok({
      items: items ?? [],
      products: (products ?? []).filter((p) => p.active),
      invoice: detail?.invoice ?? null,
      payer,
      methods,
      partialAllowed,
      wallets,
      canSell,
      canEnd: perms.includes("session.end"),
      canPay,
    });
  });
}
