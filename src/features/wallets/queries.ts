import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface WalletRow {
  id: string;
  customerName: string | null;
  customerEmail: string | null;
  currency: string;
  status: "active" | "frozen";
  balanceMinor: number;
  lastActivity: string | null;
}

type Row = Record<string, unknown>;

const toWallet = (r: Row): WalletRow => ({
  id: r.id as string,
  customerName: (r.customer_name as string | null) ?? null,
  customerEmail: (r.customer_email as string | null) ?? null,
  currency: (r.currency as string).trim(),
  status: r.status as WalletRow["status"],
  balanceMinor: Number(r.balance_minor),
  lastActivity: (r.last_activity as string | null) ?? null,
});

export async function listWallets(
  hallId: string,
  opts: { search?: string; limit: number; offset: number; walletId?: string },
): Promise<{ rows: WalletRow[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_wallets", {
    p_hall_id: hallId,
    p_search: opts.search ?? null,
    p_limit: opts.limit,
    p_offset: opts.offset,
    p_wallet_id: opts.walletId ?? null,
  });
  if (error) return null;
  const rows = (data ?? []) as Row[];
  return { total: rows[0] ? Number(rows[0].total) : 0, rows: rows.map(toWallet) };
}

export interface LedgerRow {
  id: string;
  kind: "top_up" | "payment" | "refund" | "withdrawal";
  amountMinor: number;
  balanceAfterMinor: number;
  invoiceId: string | null;
  actorName: string | null;
  createdAt: string;
  reason: string | null;
}

export async function listLedger(
  walletId: string,
  opts: { limit: number; offset: number },
): Promise<{ rows: LedgerRow[]; total: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_wallet_ledger", {
    p_wallet_id: walletId,
    p_limit: opts.limit,
    p_offset: opts.offset,
  });
  if (error) return null;
  const rows = (data ?? []) as Row[];
  return {
    total: rows[0] ? Number(rows[0].total) : 0,
    rows: rows.map((r) => ({
      id: r.id as string,
      kind: r.kind as LedgerRow["kind"],
      amountMinor: Number(r.amount_minor),
      balanceAfterMinor: Number(r.balance_after_minor),
      invoiceId: (r.invoice_id as string | null) ?? null,
      actorName: (r.actor_name as string | null) ?? null,
      createdAt: r.created_at as string,
      reason: (r.reason as string | null) ?? null,
    })),
  };
}
